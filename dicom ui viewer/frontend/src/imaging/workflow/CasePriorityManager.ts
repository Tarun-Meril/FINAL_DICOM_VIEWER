/**
 * CasePriorityManager Subsystem
 * Clinical priority triaging (STAT, HIGH, ROUTINE) and automated case escalation
 */

import { IEngineContext } from '../types/contracts';

export class CasePriorityManager {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public evaluatePriority(studyInstanceUid: string, hasCriticalFinding: boolean): 'STAT' | 'HIGH' | 'ROUTINE' {
    const priority = hasCriticalFinding ? 'STAT' : 'ROUTINE';
    this.engineContext.logger.info('Workflow', `Evaluated case priority for ${studyInstanceUid}: ${priority}`);
    return priority;
  }
}
