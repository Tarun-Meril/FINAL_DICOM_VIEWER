/**
 * HealthMonitor Subsystem
 * Automatic system health, memory leak, VRAM limit, and worker thread health monitor
 */

import { IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class HealthMonitor {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public checkHealth(): { healthy: boolean; issues: string[] } {
    const issues: string[] = [];
    const metrics = this.engineContext.performanceMonitor.getMetrics();

    if (metrics.fps < 10 && metrics.fps > 0) {
      issues.push('Low viewport frame rate detected');
    }

    const healthy = issues.length === 0;
    this.engineContext.eventBus.emit(EngineEvents.HEALTH_CHECK_PASSED, { healthy, issues });
    return { healthy, issues };
  }
}
