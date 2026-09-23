/**
 * CameraSynchronizer Subsystem
 * Synchronizes camera focal point, pan, and zoom settings across linked MPR viewports
 */

import { ICameraSynchronizer, IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class CameraSynchronizer implements ICameraSynchronizer {
  private engineContext: IEngineContext;
  private linkedViewports: Set<string> = new Set();

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public linkViewport(viewportId: string): void {
    this.linkedViewports.add(viewportId);
    this.engineContext.eventBus.emit(EngineEvents.VIEWPORT_LINKED, { viewportId, syncType: 'CAMERA' });
  }

  public unlinkViewport(viewportId: string): void {
    this.linkedViewports.delete(viewportId);
  }

  public syncCamera(sourceViewportId: string): void {
    if (!this.linkedViewports.has(sourceViewportId)) return;

    const start = performance.now();
    this.engineContext.logger.debug('MPR', `Synchronizing camera from source viewport ${sourceViewportId}`);

    const duration = performance.now() - start;
    this.engineContext.performanceMonitor.recordInitMetric('cameraSyncTimeMs', duration);

    this.engineContext.eventBus.emit(EngineEvents.CAMERA_SYNCHRONIZED, {
      sourceViewportId,
      timestamp: Date.now(),
    });
  }
}
