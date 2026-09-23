/**
 * StudyAssignmentManager Subsystem
 * Assigns DICOM studies and clinical cases to subspecialist radiologists
 */

import { IEngineContext, IWorkflowTask } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class StudyAssignmentManager {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public assignStudy(
    studyInstanceUid: string,
    radiologistId: string,
    priority: 'STAT' | 'HIGH' | 'ROUTINE' = 'ROUTINE'
  ): IWorkflowTask {
    const taskId = `task-${Date.now()}`;
    const task: IWorkflowTask = {
      taskId,
      studyInstanceUid,
      assignedRadiologist: radiologistId,
      priority,
      status: 'PENDING',
    };

    this.engineContext.logger.info('Workflow', `Assigned study ${studyInstanceUid} to ${radiologistId} (${priority})`);
    this.engineContext.eventBus.emit(EngineEvents.WORKFLOW_TASK_ASSIGNED, { taskId, radiologistId, priority });
    return task;
  }
}
