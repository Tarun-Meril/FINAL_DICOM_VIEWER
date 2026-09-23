/**
 * GPU volume rendering engine (§7).
 *
 * Pipeline: camera → ray generation → volume sampling → trilinear interpolation →
 * transfer function → gradient estimation → shading → opacity accumulation →
 * compositing → pixel. All of it runs on the GPU through vtk.js's ray-cast volume
 * mapper; nothing here composites slices on the CPU.
 */
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import '@kitware/vtk.js/Rendering/Profiles/Geometry';

import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';

import { createImageData, updateScalars, worldBounds, worldCentre } from './imageDataFactory';
import { placeCamera, cameraPreset, screenDirections, type CameraPresetId, type CameraState } from './camera';
import type { TransferFunction, BlendMode } from './transferFunction';
import type { VolumeData } from '@3d/volume/types';
import type { Vec3 } from '@3d/math/vec3';
import { normalize, scale as vscale, sub, length as vlen, add } from '@3d/math/vec3';
import { MedViewError, ErrorCode } from '@3d/core/errors';
import { scopedLogger } from '@3d/core/logger';

const log = scopedLogger('render');

const BLEND: Record<BlendMode, number> = {
  composite: 0, mip: 1, minip: 2, average: 3, additive: 4,
};

export type QualityLevel = 'interactive' | 'standard' | 'high' | 'export';

export interface QualityProfile {
  /** Ray step as a multiple of the smallest voxel dimension, so quality is
   *  dataset-independent rather than tied to one scanner's sampling. */
  readonly sampleDistance: number;
  /** Render at 1/n screen resolution and upscale (vtk.js `imageSampleDistance`). */
  readonly imageSampleDistance: number;
  readonly maximumSamplesPerRay: number;
}

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  interactive: { sampleDistance: 2.0, imageSampleDistance: 2.0, maximumSamplesPerRay: 1200 },
  standard:    { sampleDistance: 1.0, imageSampleDistance: 1.0, maximumSamplesPerRay: 1800 },
  high:        { sampleDistance: 0.7, imageSampleDistance: 1.0, maximumSamplesPerRay: 2500 },
  export:      { sampleDistance: 0.4, imageSampleDistance: 1.0, maximumSamplesPerRay: 4000 },
};

export interface GpuCapabilities {
  readonly webgl2: boolean;
  readonly renderer: string;
  readonly max3DTextureSize: number;
  readonly maxTextureSize: number;
  readonly floatLinear: boolean;
  readonly halfFloatLinear: boolean;
  /** Rough upper bound on voxels we are willing to upload, from the texture cap. */
  readonly recommendedMaxVoxels: number;
}

let cachedGpuCaps: GpuCapabilities | null = null;

export function probeGpu(): GpuCapabilities {
  if (cachedGpuCaps && cachedGpuCaps.webgl2) return cachedGpuCaps;
  const canvas = document.createElement('canvas');
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = (canvas.getContext('webgl2') || canvas.getContext('experimental-webgl2')) as WebGL2RenderingContext | null;
  } catch {
    gl = null;
  }
  if (!gl) {
    return {
      webgl2: false, renderer: 'none', max3DTextureSize: 0, maxTextureSize: 0,
      floatLinear: false, halfFloatLinear: false, recommendedMaxVoxels: 0,
    };
  }
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const max3D = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) as number;
  const rendererStr = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const softwareRenderer = /swiftshader|llvmpipe|software/i.test(rendererStr);

  cachedGpuCaps = {
    webgl2: true,
    renderer: rendererStr,
    max3DTextureSize: max3D,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    floatLinear: !!gl.getExtension('OES_texture_float_linear'),
    halfFloatLinear: !!gl.getExtension('OES_texture_half_float_linear'),
    recommendedMaxVoxels: softwareRenderer ? 140_000_000 : 320_000_000,
  };

  // Lose this temporary probing context immediately so it does NOT consume
  // the browser's maximum active WebGL context limit.
  const lose = gl.getExtension('WEBGL_lose_context');
  if (lose) {
    try { lose.loseContext(); } catch {}
  }

  return cachedGpuCaps;
}

export interface EngineOptions {
  readonly background?: readonly [number, number, number];
  /** Milliseconds of stillness before returning to high quality. */
  readonly idleQualityDelayMs?: number;
}

export interface RenderStats {
  lastRenderMs: number;
  framesRendered: number;
  quality: QualityLevel;
  volumeVoxels: number;
  volumeBytes: number;
  /** Set when the displayed volume is not the full-resolution one (§26). */
  qualityNotice: string | null;
}

export class VolumeRenderEngine {
  private grw: ReturnType<typeof vtkGenericRenderWindow.newInstance>;
  private renderer: any;
  private renderWindow: any;
  private mapper: any = null;
  private actor: any = null;
  private image: vtkImageData | null = null;
  private ctf = vtkColorTransferFunction.newInstance();
  private pwf = vtkPiecewiseFunction.newInstance();
  private clipPlanes: any[] = [];
  private volume: VolumeData | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly idleDelay: number;
  private targetQuality: QualityLevel = 'high';
  private surfaces = new Map<string, { actor: any; mapper: any }>();
  private renderScheduled = false;
  private animFrameId: number | null = null;
  private disposed = false;

  readonly stats: RenderStats = {
    lastRenderMs: 0, framesRendered: 0, quality: 'high',
    volumeVoxels: 0, volumeBytes: 0, qualityNotice: null,
  };

  constructor(container: HTMLElement, options: EngineOptions = {}) {
    const caps = probeGpu();
    if (!caps.webgl2) {
      throw new MedViewError({
        code: ErrorCode.WEBGL2_UNAVAILABLE,
        message: '3D volume rendering needs WebGL 2, which this browser or graphics driver does not provide.',
        detail: 'navigator could not create a webgl2 context',
      });
    }
    this.idleDelay = options.idleQualityDelayMs ?? 220;
    const bg = options.background ?? [0.02, 0.02, 0.03];
    this.grw = vtkGenericRenderWindow.newInstance({ background: bg as [number, number, number], listenWindowResize: true });
    this.grw.setContainer(container as HTMLDivElement);
    this.grw.resize();
    this.renderer = this.grw.getRenderer();
    this.renderWindow = this.grw.getRenderWindow();
    this.renderer.setTwoSidedLighting(true);

    const interactor = this.renderWindow.getInteractor?.();
    if (interactor) {
      interactor.onStartAnimation(() => this.enterInteractiveQuality());
      interactor.onEndAnimation(() => this.scheduleIdleQuality());
    }
    const canvas = (container as HTMLElement).querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        log.warn('WebGL context lost, preventing default to enable restoration');
      });
      canvas.addEventListener('webglcontextrestored', () => {
        log.info('WebGL context restored, requesting re-render');
        this.requestRender();
      });
    }
    log.info('engine created', { renderer: caps.renderer, max3D: caps.max3DTextureSize });
  }

  get capabilities(): GpuCapabilities { return probeGpu(); }
  getRenderer(): any { return this.renderer; }

  /** Subscribe to camera changes, whatever caused them — interaction, a preset button,
   *  a restored presentation state — so overlays can never drift out of sync. */
  onCameraChanged(cb: (state: CameraState) => void): () => void {
    const sub = this.renderer.getActiveCamera().onModified(() => cb(this.getCameraState()));
    return () => sub.unsubscribe();
  }
  getRenderWindow(): any { return this.renderWindow; }
  getContainer(): HTMLElement { return this.grw.getContainer() as HTMLElement; }

  /* ------------------------------------------------------------- volume */

  setVolume(volume: VolumeData, scalarsForDisplay?: Int16Array, qualityNotice: string | null = null): void {
    const caps = probeGpu();
    const dims = volume.geometry.dimensions;
    if (Math.max(...dims) > caps.max3DTextureSize) {
      throw new MedViewError({
        code: ErrorCode.GPU_TEXTURE_LIMIT,
        message: `This volume is ${dims.join('×')} voxels, which exceeds the ${caps.max3DTextureSize}-voxel 3D texture limit of this graphics device.`,
        detail: `MAX_3D_TEXTURE_SIZE=${caps.max3DTextureSize}`,
        context: { dimensions: [...dims], max3DTextureSize: caps.max3DTextureSize },
      });
    }

    this.teardownVolume();
    this.volume = volume;
    this.image = createImageData(scalarsForDisplay ?? volume.scalars, volume.geometry);

    this.mapper = vtkVolumeMapper.newInstance();
    this.mapper.setInputData(this.image);
    this.mapper.setAutoAdjustSampleDistances(false);

    this.actor = vtkVolume.newInstance();
    this.actor.setMapper(this.mapper);
    const prop = this.actor.getProperty();
    // Gradients are computed from the scalar field, not from opacity: opacity-derived
    // normals follow the transfer function rather than the anatomy.
    prop.setComputeNormalFromOpacity?.(false);
    prop.setRGBTransferFunction(0, this.ctf);
    prop.setScalarOpacity(0, this.pwf);

    this.renderer.addVolume(this.actor);
    for (const p of this.clipPlanes) this.mapper.addClippingPlane(p);

    this.stats.volumeVoxels = dims[0] * dims[1] * dims[2];
    this.stats.volumeBytes = this.stats.volumeVoxels * 2;
    this.stats.qualityNotice = qualityNotice;

    this.applyQuality(this.targetQuality);
    log.info('volume attached', { dimensions: [...dims], spacing: [...volume.geometry.spacing], qualityNotice });
  }

  /** Re-upload the scalar texture after a sculpt / crop / bone-removal change. */
  refreshScalars(scalars: Int16Array): void {
    if (!this.image) return;
    updateScalars(this.image, scalars);
    this.mapper?.modified();
    this.requestRender();
  }

  private teardownVolume(): void {
    if (this.actor) { this.renderer.removeVolume(this.actor); this.actor.delete?.(); this.actor = null; }
    if (this.mapper) { this.mapper.delete?.(); this.mapper = null; }
    this.image = null;
  }

  /* --------------------------------------------------- transfer function */

  setTransferFunction(tf: TransferFunction): void {
    this.ctf.removeAllPoints();
    for (const p of tf.color) this.ctf.addRGBPoint(p.hu, p.color[0], p.color[1], p.color[2]);

    this.pwf.removeAllPoints();
    for (const p of tf.opacity) {
      if (tf.interpolation === 'smooth') this.pwf.addPointLong(p.hu, p.opacity, p.midpoint ?? 0.5, p.sharpness ?? 0.35);
      else this.pwf.addPoint(p.hu, p.opacity);
    }

    if (!this.actor || !this.mapper) return;
    const prop = this.actor.getProperty();
    prop.setUseGradientOpacity(0, tf.gradientOpacity.enabled);
    prop.setGradientOpacityMinimumValue(0, tf.gradientOpacity.min);
    prop.setGradientOpacityMaximumValue(0, tf.gradientOpacity.max);
    prop.setGradientOpacityMinimumOpacity(0, tf.gradientOpacity.minOpacity);
    prop.setGradientOpacityMaximumOpacity(0, tf.gradientOpacity.maxOpacity);
    prop.setShade(tf.shading.enabled && tf.blendMode === 'composite');
    prop.setAmbient(tf.shading.ambient);
    prop.setDiffuse(tf.shading.diffuse);
    prop.setSpecular(tf.shading.specular);
    prop.setSpecularPower(tf.shading.specularPower);
    prop.setScalarOpacityUnitDistance(0, tf.scalarOpacityUnitDistance);
    if (tf.interpolationType === 'nearest') prop.setInterpolationTypeToNearest();
    else prop.setInterpolationTypeToLinear();
    this.mapper.setBlendMode(BLEND[tf.blendMode]);
    if (tf.blendMode === 'average') {
      const lo = tf.opacity.find((p) => p.opacity > 0)?.hu ?? -1024;
      this.mapper.setAverageIPScalarRange(lo, 3071);
    }
    this.requestRender();
  }

  setBlendMode(mode: BlendMode): void {
    this.mapper?.setBlendMode(BLEND[mode]);
    if (this.actor) this.actor.getProperty().setShade(mode === 'composite');
    this.requestRender();
  }

  /* ------------------------------------------------------------ quality */

  setQuality(level: QualityLevel): void {
    this.targetQuality = level;
    this.applyQuality(level);
    this.requestRender();
  }

  private applyQuality(level: QualityLevel): void {
    if (!this.mapper || !this.volume) return;
    const p = QUALITY_PROFILES[level];
    // Scale the ray step by the actual voxel size so quality is dataset-independent.
    const minSpacing = Math.min(...this.volume.geometry.spacing);
    this.mapper.setSampleDistance(p.sampleDistance * minSpacing);
    this.mapper.setImageSampleDistance(p.imageSampleDistance);
    this.mapper.setMaximumSamplesPerRay(p.maximumSamplesPerRay);
    this.stats.quality = level;
  }

  private enterInteractiveQuality(): void {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
    if (this.stats.quality !== 'interactive') this.applyQuality('interactive');
  }

  private scheduleIdleQuality(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.applyQuality(this.targetQuality);
      this.requestRender();
    }, this.idleDelay);
  }

  /* ------------------------------------------------------------- camera */

  applyCameraPreset(id: CameraPresetId, parallel?: boolean): void {
    if (!this.volume) return;
    const centre = worldCentre(this.volume.geometry);
    const b = worldBounds(this.volume.geometry);
    const radius = 0.5 * Math.hypot(b[1] - b[0], b[3] - b[2], b[5] - b[4]);
    const cam = this.renderer.getActiveCamera();
    const state = placeCamera(cameraPreset(id), centre, radius,
      parallel ?? cam.getParallelProjection(), cam.getViewAngle());
    this.setCameraState(state);
  }

  getCameraState(): CameraState {
    const cam = this.renderer.getActiveCamera();
    return {
      position: cam.getPosition() as Vec3,
      focalPoint: cam.getFocalPoint() as Vec3,
      viewUp: cam.getViewUp() as Vec3,
      parallelProjection: cam.getParallelProjection(),
      parallelScale: cam.getParallelScale(),
      viewAngle: cam.getViewAngle(),
    };
  }

  setCameraState(s: CameraState): void {
    const cam = this.renderer.getActiveCamera();
    cam.setParallelProjection(s.parallelProjection);
    cam.setViewAngle(s.viewAngle);
    cam.setPosition(...(s.position as [number, number, number]));
    cam.setFocalPoint(...(s.focalPoint as [number, number, number]));
    cam.setViewUp(...(s.viewUp as [number, number, number]));
    cam.setParallelScale(s.parallelScale);
    this.renderer.resetCameraClippingRange();
    this.updateLightFollowCamera();
    this.requestRender();
  }

  setParallelProjection(on: boolean): void {
    const cam = this.renderer.getActiveCamera();
    if (cam.getParallelProjection() === on) return;
    const centre = cam.getFocalPoint();
    const dist = vlen(sub(cam.getPosition() as Vec3, centre as Vec3));
    cam.setParallelProjection(on);
    if (on) {
      cam.setParallelScale(dist * Math.tan((cam.getViewAngle() * Math.PI) / 360));
    } else {
      const scaleV = cam.getParallelScale();
      const newDist = scaleV / Math.tan((cam.getViewAngle() * Math.PI) / 360);
      const dir = normalize(sub(cam.getPosition() as Vec3, centre as Vec3));
      cam.setPosition(...(add(centre as Vec3, vscale(dir, newDist)) as [number, number, number]));
    }
    this.renderer.resetCameraClippingRange();
    this.requestRender();
  }

  fitVolume(): void {
    this.renderer.resetCamera();
    this.renderer.resetCameraClippingRange();
    this.updateLightFollowCamera();
    this.requestRender();
  }

  /**
   * Zoom by dollying, not by narrowing the view angle.
   *
   * vtk.js's `camera.zoom()` divides the view angle in perspective mode, which changes
   * the amount of perspective distortion and, after a few steps, produces a view angle
   * no lens corresponds to. A medical viewer should move the camera and leave the optics
   * alone, so magnification changes without the anatomy changing shape.
   */
  zoom(factor: number): void {
    if (factor <= 0) return;
    const cam = this.renderer.getActiveCamera();
    if (cam.getParallelProjection()) cam.setParallelScale(cam.getParallelScale() / factor);
    else cam.dolly(factor);
    this.renderer.resetCameraClippingRange();
    this.requestRender();
  }

  orbit(azimuthDeg: number, elevationDeg: number): void {
    const cam = this.renderer.getActiveCamera();
    if (azimuthDeg) cam.azimuth(azimuthDeg);
    if (elevationDeg) { cam.elevation(elevationDeg); cam.orthogonalizeViewUp(); }
    this.renderer.resetCameraClippingRange();
    this.updateLightFollowCamera();
    this.requestRender();
  }

  roll(deg: number): void {
    this.renderer.getActiveCamera().roll(deg);
    this.requestRender();
  }

  pan(dxMm: number, dyMm: number): void {
    const cam = this.renderer.getActiveCamera();
    const dirs = screenDirections(this.getCameraState());
    const delta: Vec3 = [
      dirs.right[0] * dxMm + dirs.up[0] * dyMm,
      dirs.right[1] * dxMm + dirs.up[1] * dyMm,
      dirs.right[2] * dxMm + dirs.up[2] * dyMm,
    ];
    cam.setPosition(...(add(cam.getPosition() as Vec3, delta) as [number, number, number]));
    cam.setFocalPoint(...(add(cam.getFocalPoint() as Vec3, delta) as [number, number, number]));
    this.requestRender();
  }

  /** Keep the head-light aligned with the camera so shading stays legible from any angle. */
  private updateLightFollowCamera(): void {
    const lights = this.renderer.getLights?.() ?? [];
    for (const l of lights) l.setLightTypeToHeadLight?.();
  }

  /* ----------------------------------------------------------- clipping */

  /** Replace all clipping planes. Each plane keeps the half-space its normal points AWAY from. */
  setClippingPlanes(planes: ReadonlyArray<{ origin: Vec3; normal: Vec3 }>): void {
    if (this.mapper) this.mapper.removeAllClippingPlanes();
    this.clipPlanes = planes.map(({ origin, normal }) => {
      const p = vtkPlane.newInstance();
      p.setOrigin(origin[0], origin[1], origin[2]);
      p.setNormal(normal[0], normal[1], normal[2]);
      return p;
    });
    if (this.mapper) for (const p of this.clipPlanes) this.mapper.addClippingPlane(p);
    this.requestRender();
  }

  /* ----------------------------------------------------------- surfaces */

  /** Attach a polygonal surface layer built by `surface.ts` (§22, §23). */
  attachSurfaceActor(id: string, actor: any, mapper: any): void {
    this.removeSurface(id);
    this.renderer.addActor(actor);
    this.surfaces.set(id, { actor, mapper });
    this.requestRender();
  }

  removeSurface(id: string): void {
    const entry = this.surfaces.get(id);
    if (!entry) return;
    this.renderer.removeActor(entry.actor);
    entry.actor.delete?.();
    entry.mapper.delete?.();
    this.surfaces.delete(id);
    this.requestRender();
  }

  setVolumeVisible(visible: boolean): void {
    this.actor?.setVisibility(visible);
    this.requestRender();
  }

  /* ------------------------------------------------------------ render */

  /** Coalesce render requests into one per animation frame (§25). */
  requestRender(): void {
    if (this.disposed || this.renderScheduled) return;
    this.renderScheduled = true;
    const run = () => {
      this.renderScheduled = false;
      this.animFrameId = null;
      if (!this.disposed) this.renderNow();
    };
    if (typeof requestAnimationFrame === 'function') {
      this.animFrameId = requestAnimationFrame(run);
    } else {
      setTimeout(run, 0);
    }
  }

  renderNow(): void {
    if (this.disposed) return;
    const t = performance.now();
    this.renderWindow.render();
    this.stats.lastRenderMs = performance.now() - t;
    this.stats.framesRendered++;
  }

  /**
   * Render at export quality and return a PNG/JPEG data URL. `scale` renders the
   * offscreen buffer larger than the on-screen canvas (§30 high-resolution export).
   */
  async capture(opts: { format?: 'image/png' | 'image/jpeg'; quality?: number; scale?: number } = {}): Promise<string> {
    const previous = this.stats.quality;
    this.applyQuality('export');
    try {
      // vtk.js re-sizes the offscreen buffer for `scale`, so the export is a true
      // high-resolution render rather than an upscaled screen grab (§30).
      const promise = this.renderWindow.captureImages(opts.format ?? 'image/png', {
        scale: opts.scale ?? 1,
      })[0] as Promise<string> | undefined;
      if (!promise) {
        throw new MedViewError({
          code: ErrorCode.RENDER_FAILED,
          message: 'The rendered frame could not be captured from the graphics device.',
        });
      }
      this.renderWindow.render();
      return await promise;
    } finally {
      this.applyQuality(previous);
    }
  }

  resize(): void { if (!this.disposed) { this.grw.resize(); this.requestRender(); } }

  dispose(): void {
    this.disposed = true;
    if (this.animFrameId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.idleTimer) clearTimeout(this.idleTimer);
    for (const id of [...this.surfaces.keys()]) this.removeSurface(id);
    this.teardownVolume();
    try {
      const container = this.grw.getContainer() as HTMLElement | null;
      const canvas = container?.querySelector('canvas');
      if (canvas) {
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        const ext = gl?.getExtension('WEBGL_lose_context');
        ext?.loseContext();
      }
    } catch {}
    this.grw.delete();
  }
}
