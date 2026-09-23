/**
 * PerformanceTelemetry Subsystem
 * Collects frame timing, VRAM usage, CPU load, cache hit ratios, and streaming speeds
 */

import { IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class PerformanceTelemetry {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public reportTelemetry(): any {
    const metrics = this.engineContext.performanceMonitor.getMetrics();
    if (metrics.fps < 15) {
      this.engineContext.eventBus.emit(EngineEvents.PERFORMANCE_WARNING, { fps: metrics.fps });
    }
    return metrics;
  }
}
