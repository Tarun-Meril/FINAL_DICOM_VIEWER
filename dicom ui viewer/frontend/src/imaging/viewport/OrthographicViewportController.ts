/**
 * OrthographicViewportController Subsystem
 * Controls Cornerstone3D OrthographicViewport WebGL volume rendering (Axial, Sagittal, Coronal planes)
 */

import { Enums, setVolumesForViewports, Types } from '@cornerstonejs/core';
import { IEngineContext, IOrthographicViewportController } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class OrthographicViewportController implements IOrthographicViewportController {
  public readonly viewportId: string;
  public orientation: 'AXIAL' | 'SAGITTAL' | 'CORONAL';
  private engineContext: IEngineContext;
  private containerId: string;
  private boundVolumeId: string | null = null;

  constructor(viewportId: string, containerId: string, orientation: 'AXIAL' | 'SAGITTAL' | 'CORONAL', context: IEngineContext) {
    this.viewportId = viewportId;
    this.containerId = containerId;
    this.orientation = orientation;
    this.engineContext = context;
  }

  private getCornerstoneViewport(): Types.IVolumeViewport | undefined {
    const reManager = this.engineContext.renderingEngineManager;
    if (!reManager) return undefined;
    const re = reManager.getRenderingEngine();
    return re?.getViewport(this.viewportId) as Types.IVolumeViewport;
  }

  public async bindVolume(volumeId: string): Promise<void> {
    if (!volumeId) {
      throw new Error(`[OrthographicViewportController] Invalid volumeId provided for viewport ${this.viewportId}`);
    }

    const start = performance.now();
    this.boundVolumeId = volumeId;

    this.engineContext.logger.info('Viewport', `Binding Volume ${volumeId} (${this.orientation}) to Orthographic Viewport ${this.viewportId}`);

    const vp = this.getCornerstoneViewport();
    if (!vp) {
      throw new Error(`[OrthographicViewportController] Cornerstone volume viewport ${this.viewportId} is not initialized`);
    }

    try {
      const reManager = this.engineContext.renderingEngineManager!;
      const re = reManager.getRenderingEngine();

      await setVolumesForViewports(
        re,
        [{ volumeId }],
        [this.viewportId]
      );

      if (typeof vp.setOrientation === 'function') {
        vp.setOrientation(Enums.OrientationAxis[this.orientation]);
      }

      vp.resetCamera();
      vp.render();

      const duration = performance.now() - start;
      this.engineContext.logger.info('Viewport', `Bound volume to orthographic viewport ${this.viewportId} (${this.orientation}) in ${Math.round(duration)}ms`);

      this.engineContext.eventBus.emit(EngineEvents.VIEWPORT_RENDERED, {
        viewportId: this.viewportId,
        type: 'ORTHOGRAPHIC',
        orientation: this.orientation,
      });
    } catch (err: any) {
      this.engineContext.logger.error('Viewport', `Failed binding volume ${volumeId} to orthographic viewport ${this.viewportId}`, err);
      this.engineContext.eventBus.emit(EngineEvents.ENGINE_ERROR, {
        module: 'OrthographicViewportController',
        message: err.message || 'Orthographic volume binding failed',
        error: err,
        timestamp: Date.now(),
      });
      throw err;
    }
  }

  public setOrientation(orientation: 'AXIAL' | 'SAGITTAL' | 'CORONAL'): void {
    this.orientation = orientation;
    const vp = this.getCornerstoneViewport();
    if (vp) {
      if (typeof vp.setOrientation === 'function') {
        vp.setOrientation(Enums.OrientationAxis[orientation]);
      }
      vp.resetCamera();
      vp.render();
      this.engineContext.logger.debug('Viewport', `Orthographic viewport ${this.viewportId} orientation pseudo-set to ${orientation}`);
    }
  }

  public resetCamera(): void {
    const vp = this.getCornerstoneViewport();
    if (vp) {
      vp.resetCamera();
      vp.render();
    }
  }

  public render(): void {
    const vp = this.getCornerstoneViewport();
    if (vp) {
      vp.render();
    }
  }

  public destroy(): void {
    this.boundVolumeId = null;
  }
}
