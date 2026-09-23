/**
 * VOISynchronizer Subsystem
 * Synchronizes Window Center and Window Width settings across all linked MPR viewports
 */

import { IEngineContext, IVOISynchronizer } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class VOISynchronizer implements IVOISynchronizer {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public syncVOI(windowWidth: number, windowLevel: number, sourceViewportId?: string): void {
    this.engineContext.logger.debug('MPR', `Synchronizing VOI (WW: ${windowWidth}, WL: ${windowLevel}) across MPR viewports`);

    const controllers = this.engineContext.viewportRegistry?.getAllControllers() || [];
    controllers.forEach((ctrl) => {
      if (typeof ctrl.setWindowLevel === 'function') {
        ctrl.setWindowLevel(windowWidth, windowLevel);
      }
    });

    this.engineContext.eventBus.emit(EngineEvents.VOI_SYNCHRONIZED, {
      windowWidth,
      windowLevel,
      sourceViewportId,
    });
  }
}
