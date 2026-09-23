export enum ThumbnailPriority {
  Immediate = 0,
  Visible = 1,
  Nearby = 2,
  Background = 3,
  Prefetch = 4
}

export interface ThumbnailTask {
  id: string;
  studyUID: string;
  seriesUID: string;
  priority: ThumbnailPriority;
  execute: () => Promise<void>;
}

export class ThumbnailQueue {
  private queue: ThumbnailTask[] = [];
  private activeCount = 0;
  private maxConcurrency = 1; // Singleton renderer cannot handle concurrent requests
  private isProcessing = false;

  public enqueue(task: ThumbnailTask) {
    // Check if task already exists
    const existingIndex = this.queue.findIndex(t => t.id === task.id);
    if (existingIndex >= 0) {
      // Always update priority to reflect current visibility
      if (this.queue[existingIndex].priority !== task.priority) {
        this.queue[existingIndex].priority = task.priority;
        this.sortQueue();
      }
      return;
    }

    this.queue.push(task);
    this.sortQueue();
    this.processNext();
  }

  public cancelByStudyUID(studyUID: string) {
    this.queue = this.queue.filter(t => t.studyUID !== studyUID);
  }

  public cancelById(id: string) {
    this.queue = this.queue.filter(t => t.id !== id);
  }

  private sortQueue() {
    this.queue.sort((a, b) => a.priority - b.priority);
  }

  private async processNext() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
        // Discard prefetch tasks if we have too many active ones
        // (Implementation detail can vary based on requirement)
        
        const task = this.queue.shift();
        if (task) {
          this.activeCount++;
          // Execute asynchronously without blocking the loop
          this.executeTask(task);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeTask(task: ThumbnailTask) {
    try {
      await task.execute();
    } catch (err) {
      console.error(`[ThumbnailQueue] Task failed: ${task.id}`, err);
    } finally {
      this.activeCount--;
      this.processNext();
    }
  }
}
