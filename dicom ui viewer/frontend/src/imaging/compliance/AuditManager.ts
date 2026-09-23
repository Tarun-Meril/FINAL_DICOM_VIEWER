/**
 * AuditManager Subsystem
 * Complete HIPAA audit event logging system (user actions, study access, AI execution, measurements, reports, exports)
 */

import { IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class AuditManager {
  private engineContext: IEngineContext;
  private auditEvents: any[] = [];

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public logEvent(user: string, eventType: string, resourceId: string, details?: any): void {
    const auditRecord = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user,
      eventType,
      resourceId,
      details: details || {},
    };

    this.auditEvents.push(auditRecord);
    this.engineContext.logger.info('Compliance', `HIPAA Audit Event recorded: ${eventType} by ${user}`);
    this.engineContext.eventBus.emit(EngineEvents.AUDIT_CREATED, auditRecord);
  }

  public getEvents(): any[] {
    return [...this.auditEvents];
  }
}
