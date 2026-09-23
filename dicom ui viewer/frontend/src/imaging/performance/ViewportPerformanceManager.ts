/**
 * ViewportPerformanceManager Subsystem
 * Viewport FPS, frame latency, render duration, and dropped frame metrics tracker
 */

import { IEngineContext } from '../types/contracts';

export class ViewportPerformanceManager {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public recordRender(viewportId: string, durationMs: number): void {
    this.engineContext.performanceMonitor.recordRenderTime(durationMs);
  }
}
