/**
 * TaskQueueManager Subsystem
 * Radiologist reading task queues and worklist prioritization
 */

import { IWorkflowTask } from '../types/contracts';

export class TaskQueueManager {
  private queue: IWorkflowTask[] = [];

  public addTask(task: IWorkflowTask): void {
    this.queue.push(task);
  }

  public getTasks(): IWorkflowTask[] {
    return [...this.queue];
  }
}
