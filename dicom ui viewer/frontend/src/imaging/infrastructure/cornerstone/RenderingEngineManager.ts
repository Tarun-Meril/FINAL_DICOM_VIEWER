/**
 * Singleton RenderingEngine Manager for Cornerstone3D WebGL Canvases
 */

import { RenderingEngine, getRenderingEngine } from '@cornerstonejs/core';
import { IRenderingEngineManager, IEngineContext } from '../../types/contracts';

export class RenderingEngineManager implements IRenderingEngineManager {
  public readonly renderingEngineId: string = 'medview-rendering-engine';
  private engineContext: IEngineContext;
  private renderingEngine: RenderingEngine | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public getRenderingEngine(): RenderingEngine {
    if (!this.renderingEngine) {
      let engine = getRenderingEngine(this.renderingEngineId);
      if (!engine) {
        const start = performance.now();
        engine = new RenderingEngine(this.renderingEngineId);
        const duration = performance.now() - start;
        this.engineContext.performanceMonitor.recordInitMetric('renderingEngineCreationTimeMs', duration);
        this.engineContext.logger.info('Viewport', `RenderingEngine '${this.renderingEngineId}' created in ${Math.round(duration)}ms`);
      }
      this.renderingEngine = engine as RenderingEngine;
    }
    return this.renderingEngine;
  }

  public enableElement(viewportInput: any): void {
    try {
      const engine = this.getRenderingEngine();
      engine.enableElement(viewportInput);
      this.engineContext.logger.debug('Viewport', `Enabled element for viewport '${viewportInput.viewportId}'`);

      // Observe container resize for responsive canvas scaling
      if (viewportInput.element && typeof ResizeObserver !== 'undefined') {
        if (!this.resizeObserver) {
          this.resizeObserver = new ResizeObserver(() => {
            this.resize();
          });
        }
        this.resizeObserver.observe(viewportInput.element);
      }
    } catch (err: any) {
      this.engineContext.logger.error('Viewport', `Failed enabling element for viewport '${viewportInput?.viewportId}'`, err);
      throw err;
    }
  }

  public disableElement(viewportId: string): void {
    try {
      const engine = getRenderingEngine(this.renderingEngineId);
      if (engine) {
        const vp = engine.getViewport(viewportId);
        if (vp && vp.element && this.resizeObserver) {
          this.resizeObserver.unobserve(vp.element);
        }
        engine.disableElement(viewportId);
        this.engineContext.logger.debug('Viewport', `Disabled viewport '${viewportId}'`);
      }
    } catch (err: any) {
      this.engineContext.logger.warn('Viewport', `Notice disabling viewport '${viewportId}'`, err);
    }
  }

  public resize(viewportId?: string): void {
    try {
      const engine = getRenderingEngine(this.renderingEngineId);
      if (engine) {
        if (viewportId) {
          const vp = engine.getViewport(viewportId);
          if (vp) vp.render();
        } else {
          engine.resize(true);
          engine.render();
        }
      }
    } catch (err: any) {
      this.engineContext.logger.warn('Viewport', 'Notice resizing viewports', err);
    }
  }

  public destroy(): void {
    try {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      const engine = getRenderingEngine(this.renderingEngineId);
      if (engine) {
        engine.destroy();
        this.engineContext.logger.info('Viewport', `RenderingEngine '${this.renderingEngineId}' destroyed and WebGL resources released`);
      }
      this.renderingEngine = null;
    } catch (err: any) {
      this.engineContext.logger.error('Viewport', 'Error destroying RenderingEngine', err);
    }
  }
}
