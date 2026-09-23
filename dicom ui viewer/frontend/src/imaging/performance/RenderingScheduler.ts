/**
 * RenderingScheduler Subsystem
 * Central rendering queue, frame prioritization, viewport scheduling, render throttling, and batching
 */

import { IEngineContext } from '../types/contracts';

export class RenderingScheduler {
  private engineContext: IEngineContext;
  private renderQueue: Map<string, number> = new Map(); // viewportId -> priority
  private isProcessing: boolean = false;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public scheduleRender(viewportId: string, priority: number = 1): void {
    this.renderQueue.set(viewportId, priority);
    if (!this.isProcessing) {
      this.isProcessing = true;
      requestAnimationFrame(() => this.flushQueue());
    }
  }

  private flushQueue(): void {
    const sorted = Array.from(this.renderQueue.entries()).sort((a, b) => b[1] - a[1]);
    this.renderQueue.clear();

    for (const [vpId] of sorted) {
      const controller = this.engineContext.viewportRegistry?.getController(vpId);
      if (controller && typeof controller.render === 'function') {
        controller.render();
      }
    }

    this.isProcessing = false;
  }

  public cancelRender(viewportId: string): void {
    this.renderQueue.delete(viewportId);
  }
}
