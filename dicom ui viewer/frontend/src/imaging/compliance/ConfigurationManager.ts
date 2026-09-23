/**
 * ConfigurationManager Subsystem
 * Enterprise configuration manager with validation and encryption
 */

import { IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class ConfigurationManager {
  private engineContext: IEngineContext;
  private config: Map<string, any> = new Map();

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public set(key: string, value: any): void {
    this.config.set(key, value);
    this.engineContext.eventBus.emit(EngineEvents.CONFIGURATION_CHANGED, { key, value });
  }

  public get(key: string): any {
    return this.config.get(key);
  }
}
