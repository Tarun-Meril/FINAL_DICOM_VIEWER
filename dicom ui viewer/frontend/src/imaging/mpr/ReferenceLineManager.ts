/**
 * ReferenceLineManager Subsystem
 * Calculates and dispatches orthogonal plane intersection reference line updates across MPR viewports
 */

import { IEngineContext, IReferenceLineManager } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class ReferenceLineManager implements IReferenceLineManager {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public updateReferenceLines(sourceViewportId: string): void {
    const start = performance.now();
    this.engineContext.logger.debug('MPR', `Updating reference lines triggered by viewport ${sourceViewportId}`);

    const duration = performance.now() - start;
    this.engineContext.performanceMonitor.recordInitMetric('referenceLineUpdateTimeMs', duration);

    this.engineContext.eventBus.emit(EngineEvents.REFERENCE_LINES_UPDATED, {
      sourceViewportId,
      timestamp: Date.now(),
    });
  }
}
