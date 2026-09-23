/**
 * AuditExporter Subsystem
 * Exports audit event logs into IHE ATNA (Audit Trail and Node Authentication) Syslog XML format
 */

import { IEngineContext } from '../types/contracts';

export class AuditExporter {
  public static exportATNALog(events: any[], context?: IEngineContext): string {
    const xml = `<AuditMessage>${events.map((e) => `<Event user="${e.user}" type="${e.eventType}"/>`).join('')}</AuditMessage>`;
    if (context) {
      context.logger.info('Compliance', `Exported ${events.length} audit records to ATNA format`);
    }
    return xml;
  }
}
