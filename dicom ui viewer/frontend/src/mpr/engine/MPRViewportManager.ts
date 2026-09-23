/**
 * MPRViewportManager
 * ------------------
 * Owns the Cornerstone3D rendering engine and the three orthographic
 * VolumeViewports.
 *
 * Key production properties:
 *  - ONE volume is created per series and handed to all three viewports
 *    (`setVolumesForViewports`), so axial, coronal and sagittal share a single
 *    GPU texture. There are never three copies of the data.
 *  - Changing the crosshair, the window/level or the slab moves cameras and
 *    display properties only. The volume is never rebuilt.
 *  - Cameras are defined in patient space (see PLANE_CAMERAS), so oblique and
 *    gantry-tilted acquisitions reformat correctly without special cases.
 *
 * PORTED FROM CORNERSTONE v1.86. Two v2+ API changes, no behaviour change:
 *  1. Volume release: v1's `cache.removeVolumeLoadObject(id)` is superseded by
 *     `cache.removeVolume(id)`. Both are attempted through a guarded helper, so
 *     a series switch releases the previous volume rather than throwing and
 *     leaking it.
 *  2. `volume.getScalarData()` / `volume.scalarData` became `volume.voxelManager
 *     .getCompleteScalarDataArray()` for volumes backed by the voxel manager.
 *     `scalarDataAccessor` below tries the v4 accessor first and falls back, so
 *     the HU probe and the intensity statistics keep reading real modality
 *     units on both.
 */

import {
  Enums,
  RenderingEngine,
  cache,
  eventTarget,
  setVolumesForViewports,
  volumeLoader,
  setUseCPURendering,
  type Types,
} from '@cornerstonejs/core';
import type { Vec3 } from '../core/math/vec';
import { PLANE_CAMERAS, MPR_PLANES, type MPRPlane } from '../core/state/planes';
import type { VolumeDescriptor } from '../core/volume/VolumeBuilder';
import { focalPointForReference } from '../core/crosshair/CrosshairManager';
import { toVoiRange, type WindowLevel } from '../core/wl/WindowLevelManager';
import type { InterpolationMode, SlabMode } from '../core/state/MPRStateManager';

export const RENDERING_ENGINE_ID = 'merilview-mpr-engine';

export const VIEWPORT_IDS: Record<MPRPlane, string> = {
  axial: 'MPR_AXIAL',
  coronal: 'MPR_CORONAL',
  sagittal: 'MPR_SAGITTAL',
};

export interface MPRViewportElements {
  axial: HTMLDivElement;
  coronal: HTMLDivElement;
  sagittal: HTMLDivElement;
}

const BLEND_MODE: Record<SlabMode, number | undefined> = {
  none: undefined,
  average: Enums.BlendModes.AVERAGE_INTENSITY_BLEND,
  mip: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND,
  minip: Enums.BlendModes.MINIMUM_INTENSITY_BLEND,
};

/**
 * Release a cached volume. v4 renamed the API; both spellings are attempted so
 * a series switch never leaks a 500 MB volume on either build.
 */
function releaseVolume(volumeId: string): void {
  const c = cache as unknown as Record<string, ((id: string) => void) | undefined>;
  try {
    if (typeof c.removeVolumeLoadObject === 'function') {
      c.removeVolumeLoadObject(volumeId);
    } else if (typeof c.removeVolume === 'function') {
      c.removeVolume(volumeId);
    }
  } catch (error) {
    console.warn('[MPR] could not release volume', volumeId, error);
  }
  try {
    (cache as any).purgeVolumeCache?.();
  } catch {
    // ignore
  }
}

/**
 * Scalar data for a cached volume, in MODALITY units.
 *
 * v4 moved bulk pixel access behind `voxelManager`; v1 exposed `getScalarData()`
 * or a `scalarData` field. Both are tried so the HU probe and the intensity
 * statistics report real Hounsfield values regardless of the build.
 */
function scalarDataAccessor(volumeId: string): ArrayLike<number> | null {
  const cached = cache.getVolume(volumeId) as
    | {
        voxelManager?: { getCompleteScalarDataArray?: () => ArrayLike<number> };
        getScalarData?: () => ArrayLike<number>;
        scalarData?: ArrayLike<number>;
      }
    | undefined;
  if (!cached) return null;
  try {
    const viaVoxelManager = cached.voxelManager?.getCompleteScalarDataArray?.();
    if (viaVoxelManager) return viaVoxelManager;
  } catch {
    /* fall through to the v1 accessors */
  }
  return cached.getScalarData?.() ?? cached.scalarData ?? null;
}

export class MPRViewportManager {
  private renderingEngine: RenderingEngine | null = null;
  private volumeId: string | null = null;
  private enabled = false;
  private loadedFrames = 0;
  private totalFrames = 0;
  private loadingComplete = false;
  /** Last reference point applied, so a resize can restore it exactly. */
  private lastReference: Vec3 | null = null;
  /** Stored elements for WebGL context recovery. */
  private storedElements: MPRViewportElements | null = null;
  /** WebGL context loss listeners for cleanup. */
  private contextLostHandlers: Array<{ canvas: HTMLCanvasElement; handler: EventListener }> = [];
  /** Whether a context recovery is already in progress. */
  private recovering = false;
  /** Counter to prevent infinite recovery loops. */
  private recoveryAttempts = 0;

  /** Create the engine and enable the three viewport elements. */
  setup(elements: MPRViewportElements): void {
    this.recoveryAttempts = 0;
    setUseCPURendering(false, false);
    this.teardownEngineOnly();
    this.storedElements = elements;
    this.renderingEngine = new RenderingEngine(RENDERING_ENGINE_ID);

    const inputs: Types.PublicViewportInput[] = MPR_PLANES.map((plane) => ({
      viewportId: VIEWPORT_IDS[plane],
      type: Enums.ViewportType.ORTHOGRAPHIC,
      element: elements[plane],
      defaultOptions: {
        orientation: {
          viewPlaneNormal: [...PLANE_CAMERAS[plane].viewPlaneNormal] as Types.Point3,
          viewUp: [...PLANE_CAMERAS[plane].viewUp] as Types.Point3,
        },
        background: [0, 0, 0] as Types.Point3,
      },
    }));

    this.renderingEngine.setViewports(inputs);
    this.enabled = true;
    this.installContextLossHandlers(elements);
  }

  /**
   * Monitor for WebGL context loss on each viewport canvas. If the GPU drops
   * a context (e.g. resource exhaustion, driver reset), attempt to rebuild the
   * rendering engine and re-attach the volume rather than leaving a blank white
   * screen permanently.
   */
  private installContextLossHandlers(elements: MPRViewportElements): void {
    this.removeContextLossHandlers();
    for (const plane of MPR_PLANES) {
      const host = elements[plane];
      const canvas = host?.querySelector('canvas');
      if (!canvas) continue;
      const handler = (event: Event) => {
        event.preventDefault();
        console.warn(`[MPR] WebGL context lost on ${plane} viewport — scheduling recovery`);
        this.scheduleContextRecovery();
      };
      canvas.addEventListener('webglcontextlost', handler);
      this.contextLostHandlers.push({ canvas, handler });
    }
  }

  private removeContextLossHandlers(): void {
    for (const { canvas, handler } of this.contextLostHandlers) {
      canvas.removeEventListener('webglcontextlost', handler);
    }
    this.contextLostHandlers = [];
  }

  /**
   * After a WebGL context loss, wait a short delay for the GPU to recover,
   * then rebuild the rendering engine from the stored elements.
   */
  private scheduleContextRecovery(): void {
    if (this.recovering || !this.storedElements || this.recoveryAttempts >= 3) {
      if (this.recoveryAttempts >= 3) {
        console.warn('[MPR] WebGL context recovery reached max attempts (3). Halting recovery to prevent loop.');
      }
      return;
    }
    this.recovering = true;
    this.recoveryAttempts++;
    setTimeout(() => {
      this.recovering = false;
      if (!this.storedElements) return;
      console.info(`[MPR] Attempting WebGL context recovery (attempt ${this.recoveryAttempts}/3)...`);
      try {
        // Rebuild the rendering engine with the same elements
        const elements = this.storedElements;
        const savedVolumeId = this.volumeId;
        const savedReference = this.lastReference;

        setUseCPURendering(false, false);
        this.teardownEngineOnly();
        this.renderingEngine = new RenderingEngine(RENDERING_ENGINE_ID);

        const inputs: Types.PublicViewportInput[] = MPR_PLANES.map((plane) => ({
          viewportId: VIEWPORT_IDS[plane],
          type: Enums.ViewportType.ORTHOGRAPHIC,
          element: elements[plane],
          defaultOptions: {
            orientation: {
              viewPlaneNormal: [...PLANE_CAMERAS[plane].viewPlaneNormal] as Types.Point3,
              viewUp: [...PLANE_CAMERAS[plane].viewUp] as Types.Point3,
            },
            background: [0, 0, 0] as Types.Point3,
          },
        }));

        this.renderingEngine.setViewports(inputs);
        this.enabled = true;
        this.installContextLossHandlers(elements);

        // Re-attach the volume if one was loaded
        if (savedVolumeId && this.renderingEngine) {
          this.volumeId = savedVolumeId;
          setVolumesForViewports(
            this.renderingEngine,
            [{ volumeId: savedVolumeId }],
            this.viewportIds,
          ).then(() => {
            for (const plane of MPR_PLANES) {
              const vp = this.getViewport(plane);
              if (!vp) continue;
              vp.setCamera({
                viewPlaneNormal: [...PLANE_CAMERAS[plane].viewPlaneNormal] as Types.Point3,
                viewUp: [...PLANE_CAMERAS[plane].viewUp] as Types.Point3,
              });
              vp.resetCamera();
            }
            if (savedReference) this.jumpToWorld(savedReference, false);
            this.render();
            this.recoveryAttempts = 0;
            console.info('[MPR] WebGL context recovery successful');
          }).catch((err) => {
            console.error('[MPR] WebGL context recovery failed to re-attach volume:', err);
          });
        }
      } catch (err) {
        console.error('[MPR] WebGL context recovery failed:', err);
      }
    }, 1000);
  }

  getRenderingEngine(): RenderingEngine | null {
    return this.renderingEngine;
  }

  getViewport(plane: MPRPlane): Types.IVolumeViewport | null {
    if (!this.renderingEngine) return null;
    return (this.renderingEngine.getViewport(VIEWPORT_IDS[plane]) ??
      null) as Types.IVolumeViewport | null;
  }

  get viewportIds(): string[] {
    return MPR_PLANES.map((p) => VIEWPORT_IDS[p]);
  }

  /**
   * Build the shared volume and attach it to all three viewports.
   *
   * `imageIds` MUST already be in validated patient-space order; the geometry
   * layer produced that order and the loader is not asked to re-derive it.
   */
  async loadVolume(
    descriptor: VolumeDescriptor,
    imageIds: string[],
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<void> {
    if (!this.renderingEngine) throw new Error('Rendering engine is not set up');

    // Release the previous volume before allocating the next one: a hospital
    // workstation must not accumulate 500 MB volumes across series switches.
    if (this.volumeId) {
      releaseVolume(this.volumeId);
      this.volumeId = null;
    }

    const volumeId = `cornerstoneStreamingImageVolume:${descriptor.volumeId}`;
    const volume = await volumeLoader.createAndCacheVolume(volumeId, { imageIds });

    this.loadedFrames = 0;
    this.totalFrames = imageIds.length;
    this.loadingComplete = false;

    // Progress is taken from the loader's own frame counters where it supplies
    // them. Counting callbacks alone is unreliable: a frame that fails to
    // decode still calls back, and the volume would appear to stall forever.
    (volume as unknown as {
      load: (cb?: (e: Record<string, number>) => void) => void;
    }).load((event) => {
      const processed = event?.framesProcessed;
      const total = event?.numberOfFrames ?? event?.numFrames ?? this.totalFrames;
      if (Number.isFinite(processed)) {
        this.loadedFrames = Math.min(total, processed as number);
        this.totalFrames = total;
      } else {
        this.loadedFrames = Math.min(this.totalFrames, this.loadedFrames + 1);
      }
      if (this.loadedFrames >= this.totalFrames) this.loadingComplete = true;
      onProgress?.(this.loadedFrames, this.totalFrames);
      this.render();
    });

    const onVolumeModified = (evt: any) => {
      if (evt?.detail?.volumeId && evt.detail.volumeId !== volumeId) return;
      const processed = evt?.detail?.framesProcessed;
      const total = evt?.detail?.numberOfFrames ?? this.totalFrames;
      if (Number.isFinite(processed)) {
        this.loadedFrames = Math.min(total, processed);
      }
      if (Number.isFinite(total)) {
        this.totalFrames = total;
      }
      if (this.loadedFrames >= this.totalFrames) this.loadingComplete = true;
      onProgress?.(this.loadedFrames, this.totalFrames);
      this.render();
    };

    eventTarget.addEventListener(
      Enums.Events.IMAGE_VOLUME_MODIFIED,
      onVolumeModified,
    );

    // Definitive completion signal from the loader, so a study with a frame
    // the decoder rejects still finishes instead of hanging at 99 %.
    const onCompleted = () => {
      this.loadingComplete = true;
      this.loadedFrames = this.totalFrames;
      onProgress?.(this.loadedFrames, this.totalFrames);

      const imageVolume = cache.getVolume(volumeId) as any;
      if (imageVolume?.vtkOpenGLTexture?.update3DFromRaw) {
        try {
          imageVolume.vtkOpenGLTexture.update3DFromRaw();
        } catch (e) {
          console.warn('[MPR] Texture 3D upload note:', e);
        }
      }

      this.render();
      eventTarget.removeEventListener(
        Enums.Events.IMAGE_VOLUME_LOADING_COMPLETED,
        onCompleted,
      );
      eventTarget.removeEventListener(
        Enums.Events.IMAGE_VOLUME_MODIFIED,
        onVolumeModified,
      );
    };
    eventTarget.addEventListener(
      Enums.Events.IMAGE_VOLUME_LOADING_COMPLETED,
      onCompleted,
    );

    await setVolumesForViewports(
      this.renderingEngine,
      [{ volumeId }],
      this.viewportIds,
    );

    this.volumeId = volumeId;

    for (const plane of MPR_PLANES) {
      const vp = this.getViewport(plane);
      if (!vp) continue;
      vp.setCamera({
        viewPlaneNormal: [...PLANE_CAMERAS[plane].viewPlaneNormal] as Types.Point3,
        viewUp: [...PLANE_CAMERAS[plane].viewUp] as Types.Point3,
      });
      vp.resetCamera();
    }
    this.render();
  }

  getVolumeId(): string | null {
    return this.volumeId;
  }

  /**
   * Fraction of the series whose pixel data has arrived. Reformats are drawn
   * from whatever is already in the volume, so coronal and sagittal views are
   * incomplete until this reaches 1. The UI must say so rather than let a
   * half-filled reformat look like anatomy.
   */
  getLoadedFraction(): number {
    if (this.totalFrames === 0) return 0;
    return this.loadedFrames / this.totalFrames;
  }

  getLoadedFrameCount(): [number, number] {
    return [this.loadedFrames, this.totalFrames];
  }

  isFullyLoaded(): boolean {
    return (
      this.loadingComplete ||
      (this.totalFrames > 0 && this.loadedFrames >= this.totalFrames)
    );
  }

  /**
   * Voxel value at a patient-space point, in MODALITY units (Hounsfield for
   * CT). Reads the cached volume the viewports share — no extra copy — and
   * uses the application's own geometry to locate the voxel, so the value and
   * the displayed position come from the same transform.
   */
  sampleValueAtWorld(
    descriptor: VolumeDescriptor,
    world: Vec3,
  ): number | null {
    if (!this.volumeId) return null;
    const data = scalarDataAccessor(this.volumeId);
    if (!data) return null;

    const [i, j, k] = descriptor.transform.worldToNearestVoxel(world);
    const [nx, ny, nz] = descriptor.dimensions;
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return null;
    const value = data[k * nx * ny + j * nx + i];
    return Number.isFinite(value) ? value : null;
  }

  /** Min / max of the loaded volume, in modality units. */
  intensityStatistics(): { min: number; max: number; samples: number } | null {
    if (!this.volumeId) return null;
    const data = scalarDataAccessor(this.volumeId);
    if (!data) return null;
    let min = Infinity;
    let max = -Infinity;
    // Stride-sample: a full 125 MB scan would stall the UI thread for no gain.
    const stride = Math.max(1, Math.floor(data.length / 2_000_000));
    let samples = 0;
    for (let idx = 0; idx < data.length; idx += stride) {
      const v = data[idx];
      if (v < min) min = v;
      if (v > max) max = v;
      samples++;
    }
    return { min, max, samples };
  }

  /* ------------------------------------------------------------------ */
  /* Camera / navigation — never rebuilds the volume                     */
  /* ------------------------------------------------------------------ */

  /**
   * Move every viewport onto the slice containing `world`.
   * `recentre` = true also centres the views on the point (jump-to-point);
   * false preserves each viewport's pan, which is what a crosshair drag should
   * do on a workstation.
   */
  jumpToWorld(world: Vec3, recentre = false, planes: readonly MPRPlane[] = MPR_PLANES): void {
    this.lastReference = world;
    for (const plane of planes) {
      const vp = this.getViewport(plane);
      if (!vp) continue;
      const camera = vp.getCamera();
      const currentFocal = (camera.focalPoint ?? [0, 0, 0]) as unknown as Vec3;
      const nextFocal = focalPointForReference(plane, world, currentFocal, recentre);
      const delta: Vec3 = [
        nextFocal[0] - currentFocal[0],
        nextFocal[1] - currentFocal[1],
        nextFocal[2] - currentFocal[2],
      ];
      const position = (camera.position ?? [0, 0, 0]) as unknown as Vec3;
      vp.setCamera({
        ...camera,
        focalPoint: [...nextFocal] as Types.Point3,
        position: [
          position[0] + delta[0],
          position[1] + delta[1],
          position[2] + delta[2],
        ] as Types.Point3,
      });
    }
    this.render();
  }

  setWindowLevel(plane: MPRPlane | 'all', wl: WindowLevel): void {
    const targets = plane === 'all' ? MPR_PLANES : [plane];
    for (const p of targets) {
      const vp = this.getViewport(p);
      vp?.setProperties({ voiRange: toVoiRange(wl) });
    }
    this.render();
  }

  setInvert(plane: MPRPlane | 'all', invert: boolean): void {
    const targets = plane === 'all' ? MPR_PLANES : [plane];
    for (const p of targets) {
      this.getViewport(p)?.setProperties({ invert });
    }
    this.render();
  }

  setInterpolation(mode: InterpolationMode): void {
    for (const p of MPR_PLANES) {
      this.getViewport(p)?.setProperties({
        interpolationType:
          mode === 'nearest'
            ? Enums.InterpolationType.NEAREST
            : Enums.InterpolationType.LINEAR,
      } as never);
    }
    this.render();
  }

  /**
   * Slab reformatting. Thickness is in millimetres of patient space and is a
   * DISPLAY property of the viewport: the source volume is untouched.
   */
  setSlab(plane: MPRPlane | 'all', thicknessMm: number, mode: SlabMode): void {
    const targets = plane === 'all' ? MPR_PLANES : [plane];
    for (const p of targets) {
      const vp = this.getViewport(p);
      if (!vp) continue;
      vp.setSlabThickness(Math.max(thicknessMm, 0.01));
      const blend = BLEND_MODE[mode];
      if (blend !== undefined) {
        vp.setBlendMode(blend);
      } else {
        vp.setBlendMode(Enums.BlendModes.COMPOSITE);
      }
    }
    this.render();
  }

  setZoom(plane: MPRPlane, zoom: number): void {
    this.getViewport(plane)?.setZoom(zoom);
    this.render();
  }

  /**
   * Scale parallelScale by a multiplier (e.g. 1.1 to zoom out, 0.9 to zoom in).
   * Supports syncing across all linked viewports.
   */
  zoomViewport(plane: MPRPlane, factor: number, syncAll = false): void {
    const targets = syncAll ? MPR_PLANES : [plane];
    for (const p of targets) {
      const vp = this.getViewport(p);
      if (!vp) continue;
      const camera = vp.getCamera();
      if (!camera.parallelScale) continue;
      const nextScale = Math.max(1, Math.min(camera.parallelScale * factor, 5000));
      vp.setCamera({ ...camera, parallelScale: nextScale });
    }
    this.render();
  }

  resetCamera(plane: MPRPlane, keepReferencePoint: Vec3 | null = null): void {
    const vp = this.getViewport(plane);
    if (!vp) return;
    vp.setCamera({
      viewPlaneNormal: [...PLANE_CAMERAS[plane].viewPlaneNormal] as Types.Point3,
      viewUp: [...PLANE_CAMERAS[plane].viewUp] as Types.Point3,
    });
    vp.resetCamera();
    if (keepReferencePoint) this.jumpToWorld(keepReferencePoint, false, [plane]);
    this.render();
  }

  resetAllCameras(keepReferencePoint: Vec3 | null = null): void {
    for (const p of MPR_PLANES) this.resetCamera(p, keepReferencePoint);
  }

  /** Fit the volume into the viewport without changing the slice. */
  fit(plane: MPRPlane, referencePoint: Vec3 | null = null, syncAll = false): void {
    const targets = syncAll ? MPR_PLANES : [plane];
    for (const p of targets) {
      const vp = this.getViewport(p);
      if (!vp) continue;
      vp.resetCamera();
    }
    if (referencePoint) this.jumpToWorld(referencePoint, false, targets);
    this.render();
  }

  /** 1:1 display — one screen pixel per millimetre of the reformat pitch. */
  actualSize(plane: MPRPlane, pitchMm: number): void {
    const vp = this.getViewport(plane);
    if (!vp) return;
    const canvas = vp.getCanvas();
    const camera = vp.getCamera();
    if (!canvas || !camera.parallelScale) return;
    const heightMm = canvas.clientHeight * pitchMm;
    vp.setCamera({ ...camera, parallelScale: heightMm / 2 });
    this.render();
  }

  /* ------------------------- coordinate services --------------------- */

  canvasToWorld(plane: MPRPlane, canvasPoint: [number, number]): Vec3 | null {
    const vp = this.getViewport(plane);
    if (!vp) return null;
    return vp.canvasToWorld(canvasPoint as Types.Point2) as unknown as Vec3;
  }

  worldToCanvas(plane: MPRPlane, world: Vec3): [number, number] | null {
    const vp = this.getViewport(plane);
    if (!vp) return null;
    const p = vp.worldToCanvas([...world] as Types.Point3);
    return [p[0], p[1]];
  }

  /**
   * Half-extents of the visible region, in millimetres, along the viewport's
   * screen-right and screen-up directions. Reference-line clipping uses this
   * so lines are cut at the true visible boundary at any zoom.
   */
  visibleHalfExtentsMm(plane: MPRPlane): [number, number] | null {
    const vp = this.getViewport(plane);
    if (!vp) return null;
    const camera = vp.getCamera();
    const canvas = vp.getCanvas();
    if (!camera.parallelScale || !canvas) return null;
    const halfHeight = camera.parallelScale;
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    return [halfHeight * aspect, halfHeight];
  }

  focalPoint(plane: MPRPlane): Vec3 | null {
    const vp = this.getViewport(plane);
    if (!vp) return null;
    const c = vp.getCamera();
    return (c.focalPoint ?? null) as unknown as Vec3 | null;
  }

  cameraBasis(plane: MPRPlane): { viewUp: Vec3; viewPlaneNormal: Vec3 } | null {
    const vp = this.getViewport(plane);
    if (!vp) return null;
    const c = vp.getCamera();
    if (!c.viewUp || !c.viewPlaneNormal) return null;
    return {
      viewUp: c.viewUp as unknown as Vec3,
      viewPlaneNormal: c.viewPlaneNormal as unknown as Vec3,
    };
  }

  render(): void {
    if (!this.renderingEngine) return;
    this.renderingEngine.renderViewports(this.viewportIds);
  }

  /**
   * Resize the canvases.
   *
   * keepCamera MUST stay true: a viewport that resets its camera on resize
   * would silently throw away the radiologist's slice position, pan and zoom
   * whenever a panel changes size — on a layout switch, a fullscreen toggle or
   * a window resize. The reference point is then re-applied so the three
   * planes remain exactly coincident afterwards.
   */
  resize(): void {
    if (!this.renderingEngine) return;
    this.renderingEngine.resize(true, true);
    if (this.lastReference) this.jumpToWorld(this.lastReference, false);
  }

  private teardownEngineOnly(): void {
    this.removeContextLossHandlers();
    if (this.storedElements) {
      for (const el of [this.storedElements.axial, this.storedElements.coronal, this.storedElements.sagittal]) {
        const canvas = el?.querySelector('canvas');
        if (canvas) {
          try {
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            gl?.getExtension('WEBGL_lose_context')?.loseContext();
          } catch {}
        }
      }
    }
    if (this.renderingEngine) {
      this.renderingEngine.destroy();
      this.renderingEngine = null;
      this.enabled = false;
    }
  }

  destroy(): void {
    if (this.volumeId) {
      releaseVolume(this.volumeId);
      this.volumeId = null;
    }
    this.teardownEngineOnly();
    this.storedElements = null;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }
}
