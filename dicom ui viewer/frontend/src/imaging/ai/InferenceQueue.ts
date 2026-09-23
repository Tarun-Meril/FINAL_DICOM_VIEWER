/**
 * InferenceQueue Subsystem
 * Priority queue buffering queued inference tasks for batch scheduling
 */

import { IAIJob } from '../types/contracts';

export class InferenceQueue {
  private queue: IAIJob[] = [];

  public enqueue(job: IAIJob): void {
    this.queue.push(job);
  }

  public dequeue(): IAIJob | undefined {
    return this.queue.shift();
  }

  public getLength(): number {
    return this.queue.length;
  }
}
