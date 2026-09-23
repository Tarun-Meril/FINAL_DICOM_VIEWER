/**
 * WorkflowManager Subsystem Orchestrator
 * Orchestrates clinical workflow triage, study assignments, notification pipeline, and HIPAA audit trails
 */

import { IEngineContext, IWorkflowManager, IWorkflowTask } from '../types/contracts';
import { StudyAssignmentManager } from './StudyAssignmentManager';
import { AuditWorkflowManager } from './AuditWorkflowManager';

export class WorkflowManager implements IWorkflowManager {
  private engineContext: IEngineContext;
  private assignmentManager: StudyAssignmentManager;
  private auditManager: AuditWorkflowManager;

  constructor(context: IEngineContext) {
    this.engineContext = context;
    this.assignmentManager = new StudyAssignmentManager(context);
    this.auditManager = new AuditWorkflowManager(context);
  }

  public assignCase(
    studyInstanceUid: string,
    radiologistId: string,
    priority: 'STAT' | 'HIGH' | 'ROUTINE' = 'ROUTINE'
  ): IWorkflowTask {
    const task = this.assignmentManager.assignStudy(studyInstanceUid, radiologistId, priority);
    this.auditManager.logAction('ASSIGN_CASE', radiologistId, { studyInstanceUid, priority });
    return task;
  }

  public getAuditTrail(): string[] {
    return this.auditManager.getAuditTrail();
  }
}
