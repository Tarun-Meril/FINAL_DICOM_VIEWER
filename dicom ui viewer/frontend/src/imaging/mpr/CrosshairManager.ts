/**
 * CrosshairManager Subsystem
 * Manages shared 3D crosshair position navigation and visibility across MPR viewports
 */

import { ICrosshairManager, IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class CrosshairManager implements ICrosshairManager {
  private engineContext: IEngineContext;
  private currentWorldPos: [number, number, number] = [0, 0, 0];
  private isVisible: boolean = true;
  private isLocked: boolean = false;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public setWorldPosition(pos: [number, number, number], sourceViewportId?: string): void {
    if (this.isLocked) return;

    const start = performance.now();
    this.currentWorldPos = [pos[0], pos[1], pos[2]];

    const duration = performance.now() - start;
    this.engineContext.performanceMonitor.recordInitMetric('crosshairLatencyMs', duration);

    this.engineContext.logger.debug('MPR', `Crosshair position updated to [${pos.map((n) => n.toFixed(1)).join(', ')}]`);

    this.engineContext.eventBus.emit(EngineEvents.CROSSHAIR_MOVED, {
      worldCoordinate: this.currentWorldPos,
      sourceViewportId,
    });
  }

  public getWorldPosition(): [number, number, number] {
    return [...this.currentWorldPos];
  }

  public setCrosshairVisibility(visible: boolean): void {
    this.isVisible = visible;
    this.engineContext.logger.debug('MPR', `Crosshair visibility set to ${visible}`);
  }

  public setLock(locked: boolean): void {
    this.isLocked = locked;
  }
}
