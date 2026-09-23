/**
 * OfflineCacheManager Subsystem
 * Local offline mode DICOM storage & sync manager for PWA and Electron environments
 */

import { IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class OfflineCacheManager {
  private engineContext: IEngineContext;
  private isOfflineMode: boolean = false;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public setOfflineMode(offline: boolean): void {
    this.isOfflineMode = offline;
    this.engineContext.logger.info('Deployment', `Offline mode set to ${offline}`);
    this.engineContext.eventBus.emit(EngineEvents.OFFLINE_STATUS_CHANGED, { offline });
  }

  public isOffline(): boolean {
    return this.isOfflineMode;
  }
}
