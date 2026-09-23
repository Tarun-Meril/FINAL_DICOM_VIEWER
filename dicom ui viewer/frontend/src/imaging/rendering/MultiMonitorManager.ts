/**
 * MultiMonitorManager Subsystem
 * Multi-monitor diagnostic workstation profile management (e.g. 2x 5MP Monitors, 4x 4K Monitors)
 */

import { IEngineContext } from '../types/contracts';

export class MultiMonitorManager {
  private engineContext: IEngineContext;
  private activeMonitors: number = 1;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public setMonitorCount(count: number): void {
    this.activeMonitors = count;
    this.engineContext.logger.info('Rendering', `MultiMonitorManager configured for ${count} diagnostic monitor(s)`);
  }

  public getMonitorCount(): number {
    return this.activeMonitors;
  }
}
