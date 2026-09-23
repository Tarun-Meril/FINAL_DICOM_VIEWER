/**
 * ViewportSynchronizer Subsystem Shell Foundation
 * Prepares engine for multi-viewport Crosshairs, VOI, Camera, and Slice synchronization in Phase 5+
 */

import { IEngineContext, IViewportSynchronizer } from '../types/contracts';

export class ViewportSynchronizer implements IViewportSynchronizer {
  public readonly id: string;
  private engineContext: IEngineContext;
  private viewportIds: Set<string> = new Set();

  constructor(id: string, context: IEngineContext) {
    this.id = id;
    this.engineContext = context;
  }

  public addViewport(viewportId: string): void {
    this.viewportIds.add(viewportId);
    this.engineContext.logger.debug('Sync', `Added viewport ${viewportId} to synchronizer group ${this.id}`);
  }

  public removeViewport(viewportId: string): void {
    this.viewportIds.delete(viewportId);
    this.engineContext.logger.debug('Sync', `Removed viewport ${viewportId} from synchronizer group ${this.id}`);
  }

  public destroy(): void {
    this.viewportIds.clear();
    this.engineContext.logger.debug('Sync', `Synchronizer group ${this.id} destroyed`);
  }
}
