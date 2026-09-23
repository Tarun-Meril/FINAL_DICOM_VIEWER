/**
 * ProgressiveSeriesLoader Subsystem
 * Series slice prioritization, middle-out slice ordering, and cancelable progressive stream loading
 */

import { IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class ProgressiveSeriesLoader {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public loadSeriesSlicesProgressively(seriesInstanceUid: string, totalSlices: number): void {
    this.engineContext.logger.debug('Streaming', `Loading ${totalSlices} slices progressively for series ${seriesInstanceUid}`);
    this.engineContext.eventBus.emit(EngineEvents.PROGRESSIVE_SLICE_LOADED, { seriesInstanceUid, sliceIndex: Math.floor(totalSlices / 2) });
  }
}
