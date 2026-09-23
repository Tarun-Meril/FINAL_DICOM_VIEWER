/**
 * ViewportManager Subsystem
 * Orchestrates viewport registration, creation, destruction, and resize operations
 */

import { Enums } from '@cornerstonejs/core';
import {
  IEngineContext,
  IStackViewportController,
  IViewportCreationOptions,
  IViewportManager,
} from '../types/contracts';
import { EngineEvents } from '../types/events';
import { StackViewportController } from './StackViewportController';

export class ViewportManager implements IViewportManager {
  private engineContext: IEngineContext;
  private activeViewportId: string | null = null;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public async createViewport(options: IViewportCreationOptions): Promise<IStackViewportController> {
    const { viewportId, container, type = 'STACK', background = [0, 0, 0] } = options;

    if (!viewportId || !container) {
      throw new Error('[ViewportManager] Invalid creation parameters (viewportId and container element required)');
    }

    const existingController = this.engineContext.viewportRegistry?.getController(viewportId);
    if (existingController) {
      return existingController;
    }

    const start = performance.now();
    this.engineContext.logger.info('Viewport', `Creating ${type} viewport: ${viewportId}`);

    try {
      const containerId = container.id || `container-${viewportId}`;
      if (!container.id) container.id = containerId;

      let csType = Enums.ViewportType.STACK;
      if (type === 'ORTHOGRAPHIC') csType = Enums.ViewportType.ORTHOGRAPHIC;
      else if (type === 'VOLUME_3D') csType = Enums.ViewportType.VOLUME_3D;

      const viewportInput = {
        viewportId,
        type: csType,
        element: container,
        defaultOptions: {
          background,
          orientation: options.orientation ? Enums.OrientationAxis[options.orientation] : undefined,
        },
      };

      // Enable HTML element in RenderingEngineManager
      this.engineContext.renderingEngineManager!.enableElement(viewportInput);

      // Create controller
      const controller = new StackViewportController(viewportId, containerId, this.engineContext);
      this.engineContext.viewportRegistry!.register(viewportId, controller, containerId);

      // Set active if none selected
      if (!this.activeViewportId) {
        this.setActiveViewport(viewportId);
      }

      const duration = performance.now() - start;
      this.engineContext.performanceMonitor.recordInitMetric('viewportCreationTimeMs', duration);
      this.engineContext.logger.info('Viewport', `Viewport ${viewportId} created in ${Math.round(duration)}ms`);

      this.engineContext.eventBus.emit(EngineEvents.VIEWPORT_CREATED, {
        viewportId,
        type,
        containerId,
      });

      return controller;
    } catch (err: any) {
      this.engineContext.logger.error('Viewport', `Failed creating viewport ${viewportId}`, err);
      this.engineContext.eventBus.emit(EngineEvents.ENGINE_ERROR, {
        module: 'ViewportManager',
        message: err.message || 'Viewport creation failed',
        error: err,
        timestamp: Date.now(),
      });
      throw err;
    }
  }

  public async destroyViewport(viewportId: string): Promise<void> {
    this.engineContext.logger.info('Viewport', `Destroying viewport: ${viewportId}`);

    try {
      const controller = this.engineContext.viewportRegistry?.getController(viewportId);
      if (controller) {
        this.engineContext.renderingEngineManager?.disableElement(viewportId);
        this.engineContext.viewportRegistry?.unregister(viewportId);
      }

      if (this.activeViewportId === viewportId) {
        const remaining = this.engineContext.viewportRegistry?.getAllControllers() || [];
        this.activeViewportId = remaining.length > 0 ? remaining[0].viewportId : null;
        this.engineContext.stateStore.updateState({ activeViewportId: this.activeViewportId });
      }

      this.engineContext.eventBus.emit(EngineEvents.VIEWPORT_DESTROYED, { viewportId });
    } catch (err: any) {
      this.engineContext.logger.error('Viewport', `Error destroying viewport ${viewportId}`, err);
    }
  }

  public resizeViewport(viewportId: string): void {
    this.engineContext.renderingEngineManager?.resize(viewportId);
    this.engineContext.eventBus.emit(EngineEvents.VIEWPORT_RESIZED, { viewportId });
  }

  public resizeAll(): void {
    this.engineContext.renderingEngineManager?.resize();
  }

  public getController(viewportId: string): IStackViewportController | undefined {
    return this.engineContext.viewportRegistry?.getController(viewportId);
  }

  public setActiveViewport(viewportId: string): void {
    if (this.activeViewportId !== viewportId) {
      this.activeViewportId = viewportId;
      this.engineContext.stateStore.updateState({ activeViewportId: viewportId });
      this.engineContext.logger.debug('Viewport', `Active viewport set to ${viewportId}`);
      this.engineContext.eventBus.emit(EngineEvents.VIEWPORT_ACTIVATED, { viewportId });
    }
  }

  public getActiveViewportId(): string | null {
    return this.activeViewportId;
  }
}
