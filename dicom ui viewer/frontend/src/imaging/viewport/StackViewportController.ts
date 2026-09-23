/**
 * StackViewportController Subsystem
 * Controls Cornerstone3D 2D StackViewport WebGL canvas rendering, image stacks, and camera manipulations
 */

import { Enums, Types } from '@cornerstonejs/core';
import { IEngineContext, IStackViewportController, IViewportState } from '../types/contracts';
import { EngineEvents } from '../types/events';
import { DisplaySet } from '../domain/entities/DicomEntities';

export class StackViewportController implements IStackViewportController {
  public readonly viewportId: string;
  private engineContext: IEngineContext;
  private containerId: string;
  private currentDisplaySet: DisplaySet | null = null;
  private sliceIndex: number = 0;

  // Viewport parameters tracking
  private windowWidth: number = 400;
  private windowLevel: number = 40;
  private currentZoom: number = 1.0;
  private panOffset: [number, number] = [0, 0];
  private rotationAngle: number = 0;

  constructor(viewportId: string, containerId: string, context: IEngineContext) {
    this.viewportId = viewportId;
    this.containerId = containerId;
    this.engineContext = context;
  }

  private getCornerstoneViewport(): Types.IStackViewport | undefined {
    const reManager = this.engineContext.renderingEngineManager;
    if (!reManager) return undefined;
    const re = reManager.getRenderingEngine();
    return re?.getViewport(this.viewportId) as Types.IStackViewport;
  }

  public async bindDisplaySet(displaySet: DisplaySet, initialSliceIndex?: number): Promise<void> {
    if (!displaySet || !displaySet.imageIds || displaySet.imageIds.length === 0) {
      throw new Error(`[StackViewportController] DisplaySet ${displaySet?.displaySetInstanceUID} has no valid imageIds`);
    }

    const start = performance.now();
    this.currentDisplaySet = displaySet;
    this.sliceIndex = initialSliceIndex !== undefined 
      ? Math.max(0, Math.min(displaySet.imageIds.length - 1, initialSliceIndex))
      : Math.floor(displaySet.imageIds.length / 2);

    this.engineContext.logger.info('Viewport', `Binding DisplaySet ${displaySet.displaySetInstanceUID} (${displaySet.imageIds.length} slices) to viewport ${this.viewportId}`);
    this.engineContext.eventBus.emit(EngineEvents.DISPLAYSET_BOUND, {
      viewportId: this.viewportId,
      displaySetInstanceUid: displaySet.displaySetInstanceUID,
    });

    const vp = this.getCornerstoneViewport();
    if (!vp) {
      throw new Error(`[StackViewportController] Cornerstone viewport ${this.viewportId} is not initialized`);
    }

    try {
      await vp.setStack(displaySet.imageIds, this.sliceIndex);
      this.engineContext.eventBus.emit(EngineEvents.STACK_LOADED, {
        viewportId: this.viewportId,
        numImageIds: displaySet.imageIds.length,
      });

      // Synchronize active DICOM VOI parameters from first instance
      if (displaySet.instances && displaySet.instances[this.sliceIndex]) {
        const inst = displaySet.instances[this.sliceIndex];
        if (inst.windowWidth !== undefined && inst.windowCenter !== undefined) {
          const ww = Number(inst.windowWidth);
          const wl = Number(inst.windowCenter);
          if (!isNaN(ww) && !isNaN(wl) && ww > 0) {
            this.windowWidth = ww;
            this.windowLevel = wl;
            const lower = wl - ww / 2;
            const upper = wl + ww / 2;
            try { vp.setProperties({ voiRange: { lower, upper } }); } catch (e) {}
          }
        }
      }

      vp.resetCamera();
      vp.render();

      const duration = performance.now() - start;
      this.engineContext.performanceMonitor.recordInitMetric('displaySetBindTimeMs', duration);
      this.engineContext.logger.info('Viewport', `Rendered first slice for viewport ${this.viewportId} in ${Math.round(duration)}ms`);
      
      this.engineContext.eventBus.emit(EngineEvents.FIRST_IMAGE_RENDERED, {
        viewportId: this.viewportId,
        currentSlice: this.sliceIndex + 1,
        totalSlices: displaySet.imageIds.length,
      });

      this.engineContext.eventBus.emit(EngineEvents.VIEWPORT_RENDERED, {
        viewportId: this.viewportId,
        type: 'STACK',
      });
    } catch (err: any) {
      this.engineContext.logger.error('Viewport', `Error rendering stack on viewport ${this.viewportId}`, err);
      this.engineContext.eventBus.emit(EngineEvents.ENGINE_ERROR, {
        module: 'StackViewportController',
        message: err.message || 'Stack viewport render failed',
        error: err,
        timestamp: Date.now(),
      });
      throw err;
    }
  }

  public render(): void {
    const vp = this.getCornerstoneViewport();
    if (vp) {
      const start = performance.now();
      vp.render();
      const duration = performance.now() - start;
      this.engineContext.performanceMonitor.recordRenderTime(duration);
    }
  }

  public resetCamera(): void {
    const vp = this.getCornerstoneViewport();
    if (vp) {
      vp.resetCamera();
      vp.render();
      this.currentZoom = 1.0;
      this.panOffset = [0, 0];
    }
  }

  public nextSlice(): void {
    if (!this.currentDisplaySet) return;
    this.setSlice(this.sliceIndex + 1);
  }

  public previousSlice(): void {
    if (!this.currentDisplaySet) return;
    this.setSlice(this.sliceIndex - 1);
  }

  public setSlice(targetIndex: number): void {
    if (!this.currentDisplaySet || !this.currentDisplaySet.imageIds) return;
    const maxIdx = this.currentDisplaySet.imageIds.length - 1;
    const newIdx = Math.max(0, Math.min(maxIdx, targetIndex));

    if (newIdx !== this.sliceIndex) {
      this.sliceIndex = newIdx;
      const vp = this.getCornerstoneViewport();
      if (vp) {
        vp.setImageIdIndex(newIdx);
        vp.render();
      }
      this.engineContext.logger.debug('Viewport', `Viewport ${this.viewportId} slice changed to ${newIdx + 1}/${maxIdx + 1}`);
      this.engineContext.eventBus.emit(EngineEvents.SLICE_CHANGED, {
        viewportId: this.viewportId,
        currentSlice: newIdx + 1,
        totalSlices: maxIdx + 1,
      });
    }
  }

  public pan(deltaX: number, deltaY: number): void {
    const vp = this.getCornerstoneViewport();
    if (vp) {
      const pan = vp.getPan ? vp.getPan() : [0, 0];
      const newPan: [number, number] = [pan[0] + deltaX, pan[1] + deltaY];
      if (vp.setPan) vp.setPan(newPan);
      vp.render();
      this.panOffset = newPan;
    }
  }

  public zoom(zoomFactor: number): void {
    const vp = this.getCornerstoneViewport();
    if (vp) {
      const current = vp.getZoom();
      const newZoom = Math.max(0.1, Math.min(20, current * zoomFactor));
      vp.setZoom(newZoom);
      vp.render();
      this.currentZoom = newZoom;
    }
  }

  public setWindowLevel(windowWidth: number, windowLevel: number): void {
    const vp = this.getCornerstoneViewport();
    if (vp) {
      this.windowWidth = Math.max(1, windowWidth);
      this.windowLevel = windowLevel;
      const lower = this.windowLevel - this.windowWidth / 2;
      const upper = this.windowLevel + this.windowWidth / 2;
      try { vp.setProperties({ voiRange: { lower, upper } }); } catch (e) {}
      vp.render();
      this.engineContext.eventBus.emit(EngineEvents.WINDOW_LEVEL_CHANGED, {
        viewportId: this.viewportId,
        windowWidth: this.windowWidth,
        windowLevel: this.windowLevel,
      });
    }
  }

  public fitToWindow(): void {
    this.resetCamera();
  }

  public reset(): void {
    this.resetCamera();
    if (this.currentDisplaySet && this.currentDisplaySet.instances && this.currentDisplaySet.instances[this.sliceIndex]) {
      const inst = this.currentDisplaySet.instances[this.sliceIndex];
      this.setWindowLevel(inst.windowWidth, inst.windowCenter);
    }
  }

  public getCurrentSliceIndex(): number {
    return this.sliceIndex;
  }

  public getTotalSlices(): number {
    return this.currentDisplaySet?.imageIds?.length || 0;
  }

  public getState(): IViewportState {
    return {
      viewportId: this.viewportId,
      type: 'STACK',
      containerId: this.containerId,
      displaySetInstanceUid: this.currentDisplaySet?.displaySetInstanceUID,
      currentSlice: this.sliceIndex + 1,
      totalSlices: this.getTotalSlices(),
      windowWidth: Math.round(this.windowWidth),
      windowLevel: Math.round(this.windowLevel),
      zoom: Math.round(this.currentZoom * 100) / 100,
      pan: this.panOffset,
      rotation: this.rotationAngle,
    };
  }
}
