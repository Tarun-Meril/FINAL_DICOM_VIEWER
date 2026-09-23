/**
 * FrameScheduler Subsystem
 * 60 FPS / 120 FPS display refresh rate frame synchronizer and frame drop detector
 */

import { IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class FrameScheduler {
  private engineContext: IEngineContext;
  private lastFrameTime: number = 0;
  private targetFps: number = 60;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public recordFrame(viewportId: string): void {
    const now = performance.now();
    const delta = now - this.lastFrameTime;
    this.lastFrameTime = now;

    const frameBudgetMs = 1000 / this.targetFps;
    if (delta > frameBudgetMs * 1.5 && this.lastFrameTime > 0) {
      this.engineContext.eventBus.emit(EngineEvents.FRAME_DROPPED, { viewportId, deltaMs: Math.round(delta) });
    } else {
      this.engineContext.eventBus.emit(EngineEvents.FRAME_RENDERED, { viewportId, deltaMs: Math.round(delta) });
    }
  }
}
