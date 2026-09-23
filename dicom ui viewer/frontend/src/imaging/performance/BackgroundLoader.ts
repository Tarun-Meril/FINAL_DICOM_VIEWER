/**
 * BackgroundLoader Subsystem
 * Non-blocking background metadata loading, thumbnail generation, and volume preparation
 */

import { IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class BackgroundLoader {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public enqueueTask(taskName: string, fn: () => Promise<void>): void {
    this.engineContext.eventBus.emit(EngineEvents.BACKGROUND_TASK_STARTED, { taskName });
    setTimeout(async () => {
      try {
        await fn();
        this.engineContext.eventBus.emit(EngineEvents.BACKGROUND_TASK_FINISHED, { taskName });
      } catch (err: any) {
        this.engineContext.logger.error('Performance', `Background task ${taskName} failed`, err);
      }
    }, 0);
  }
}
