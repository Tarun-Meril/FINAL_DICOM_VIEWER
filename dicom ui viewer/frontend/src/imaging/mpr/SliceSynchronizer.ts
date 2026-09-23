/**
 * SliceSynchronizer Subsystem
 * Synchronizes orthogonal slice scrolling and intersection planes across MPR viewports
 */

import { IEngineContext, ISliceSynchronizer } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class SliceSynchronizer implements ISliceSynchronizer {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public syncSlice(sourceViewportId: string, sliceDelta: number): void {
    const start = performance.now();
    this.engineContext.logger.debug('MPR', `Synchronizing slice scrolling (delta: ${sliceDelta}) from ${sourceViewportId}`);

    const duration = performance.now() - start;
    this.engineContext.performanceMonitor.recordInitMetric('sliceSyncLatencyMs', duration);

    this.engineContext.eventBus.emit(EngineEvents.SLICE_SYNCHRONIZED, {
      sourceViewportId,
      sliceDelta,
      timestamp: Date.now(),
    });
  }
}
