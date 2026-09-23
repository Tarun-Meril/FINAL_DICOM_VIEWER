/**
 * AIEventBus Subsystem
 * Dedicated event bus for broadcasting AI model registration, job execution, and GPU memory events
 */

import { EngineEvents } from '../types/events';
import { IEngineContext } from '../types/contracts';

export class AIEventBus {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public emit(event: EngineEvents | string, payload?: any): void {
    this.engineContext.eventBus.emit(event, payload);
  }
}
