/**
 * LandmarkManager Subsystem
 * Manages manual and automated anatomical landmark pairs for landmark-based registration
 */

import { IEngineContext, ILandmarkManager, ILandmarkPair } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class LandmarkManager implements ILandmarkManager {
  private engineContext: IEngineContext;
  private landmarks: Map<string, ILandmarkPair> = new Map();

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public addLandmarkPair(pair: ILandmarkPair): void {
    if (!pair || !pair.id) return;
    this.landmarks.set(pair.id, pair);
    this.engineContext.logger.info('Registration', `Added anatomical landmark pair ${pair.id}`);
    this.engineContext.eventBus.emit(EngineEvents.LANDMARK_UPDATED, { landmarkId: pair.id });
  }

  public getLandmarkPairs(): ILandmarkPair[] {
    return Array.from(this.landmarks.values());
  }
}
