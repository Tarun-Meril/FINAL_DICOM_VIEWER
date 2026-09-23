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
 */

import {
  Enums,
  RenderingEngine,
  cache,
  eventTarget,
  setVolumesForViewports,
  volumeLoader,
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

export class MPRViewportManager {
  private renderingEngine: RenderingEngine | null = null;
  private volumeId: string | null = null;
  private enabled = false;
  private loadedFrames = 0;
  private totalFrames = 0;
  private loadingComplete = false;
  /** Last reference point applied, so a resize can restore it exactly. */
  private lastReference: Vec3 | null = null;

  /** Create the engine and enable the three viewport elements. */
  setup(elements: MPRViewportElements): void {
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
      cache.removeVolumeLoadObject(this.volumeId);
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
    });

    // Definitive completion signal from the loader, so a study with a frame
    // the decoder rejects still finishes instead of hanging at 99 %.
    const onCompleted = () => {
      this.loadingComplete = true;
      this.loadedFrames = this.totalFrames;
      onProgress?.(this.loadedFrames, this.totalFrames);
      eventTarget.removeEventListener(
        Enums.Events.IMAGE_VOLUME_LOADING_COMPLETED,
        onCompleted,
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
    const cached = cache.getVolume(this.volumeId) as
      | { getScalarData?: () => ArrayLike<number>; scalarData?: ArrayLike<number> }
      | undefined;
    const data = cached?.getScalarData?.() ?? cached?.scalarData;
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
    const cached = cache.getVolume(this.volumeId) as
      | { getScalarData?: () => ArrayLike<number>; scalarData?: ArrayLike<number> }
      | undefined;
    const data = cached?.getScalarData?.() ?? cached?.scalarData;
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
    this.renderingEngine?.render();
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
    if (this.renderingEngine) {
      this.renderingEngine.destroy();
      this.renderingEngine = null;
      this.enabled = false;
    }
  }

  destroy(): void {
    if (this.volumeId) {
      cache.removeVolumeLoadObject(this.volumeId);
      this.volumeId = null;
    }
    this.teardownEngineOnly();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }
}
