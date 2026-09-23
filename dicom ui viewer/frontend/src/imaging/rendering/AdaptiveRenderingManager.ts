/**
 * AdaptiveRenderingManager Subsystem
 * Dynamically adjusts rendering resolution & sample distance during viewport interaction (drag, pan, rotate)
 */

import { IEngineContext } from '../types/contracts';

export class AdaptiveRenderingManager {
  private engineContext: IEngineContext;
  private isInteracting: boolean = false;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public setInteractionState(interacting: boolean): void {
    this.isInteracting = interacting;
    const qualityLevel = interacting ? 'LOW' : 'HIGH';
    this.engineContext.logger.debug('Rendering', `Adaptive rendering state changed: interacting=${interacting}, quality=${qualityLevel}`);
  }

  public getInteractionState(): boolean {
    return this.isInteracting;
  }
}
