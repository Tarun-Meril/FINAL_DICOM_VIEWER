/**
 * BlendModeManager Subsystem
 * Dual-volume overlay blending modes (Alpha, Maximum Intensity, Difference, Overlay)
 */

import { IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class BlendModeManager {
  private engineContext: IEngineContext;
  private currentMode: 'ALPHA' | 'MAXIMUM_INTENSITY' | 'DIFFERENCE' | 'OVERLAY' = 'ALPHA';

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public setBlendMode(mode: 'ALPHA' | 'MAXIMUM_INTENSITY' | 'DIFFERENCE' | 'OVERLAY'): void {
    this.currentMode = mode;
    this.engineContext.logger.info('Fusion', `Blend mode set to ${mode}`);
    this.engineContext.eventBus.emit(EngineEvents.BLEND_MODE_CHANGED, { blendMode: mode });
  }

  public getBlendMode(): string {
    return this.currentMode;
  }
}
