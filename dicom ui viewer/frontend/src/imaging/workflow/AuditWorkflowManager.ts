/**
 * AuditWorkflowManager Subsystem
 * HIPAA-compliant audit trail logging for patient record access and report modifications
 */

import { IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class AuditWorkflowManager {
  private engineContext: IEngineContext;
  private auditLogs: string[] = [];

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public logAction(action: string, user: string, details?: any): void {
    const entry = `[${new Date().toISOString()}] USER: ${user} | ACTION: ${action} | DETAILS: ${JSON.stringify(details || {})}`;
    this.auditLogs.push(entry);

    this.engineContext.logger.info('Workflow', `Audit entry logged: ${action}`);
    this.engineContext.eventBus.emit(EngineEvents.AUDIT_LOGGED, { action, user });
  }

  public getAuditTrail(): string[] {
    return [...this.auditLogs];
  }
}
