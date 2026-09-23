/**
 * RemoteRenderingManager Subsystem
 * Architecture slot for Cloud PACS, thin client, and remote server-side GPU rendering
 */

import { IEngineContext } from '../types/contracts';

export class RemoteRenderingManager {
  private engineContext: IEngineContext;
  private isRemoteEnabled: boolean = false;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public setRemoteEnabled(enabled: boolean): void {
    this.isRemoteEnabled = enabled;
    this.engineContext.logger.info('Performance', `Remote GPU rendering set to ${enabled}`);
  }

  public isEnabled(): boolean {
    return this.isRemoteEnabled;
  }
}
