/**
 * NotificationManager Subsystem
 * Real-time notification pipeline for STAT critical alerts and assignment changes
 */

import { IEngineContext } from '../types/contracts';

export class NotificationManager {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public notifyRadiologist(radiologistId: string, message: string): void {
    this.engineContext.logger.info('Workflow', `Notification sent to ${radiologistId}: ${message}`);
  }
}
