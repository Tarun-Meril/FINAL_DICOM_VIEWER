import { EventBus, MPREvents } from './EventBus';
import { Logger, LogCategory } from '../../shared/Logger';
import { RenderingManager } from '../managers/RenderingManager';
import { type Types } from '@cornerstonejs/core';

class CrosshairServiceImpl {
  private currentWorldPosition: number[] = [0, 0, 0];

  updatePosition(worldPos: number[]) {
    this.currentWorldPosition = worldPos;
    Logger.debug(LogCategory.TOOL, `[CrosshairService] Position updated to [${worldPos.join(', ')}]`);
    EventBus.publish(MPREvents.CROSSHAIR_MOVED, worldPos);
  }

  jumpToSlice(viewportId: string, worldPos: number[]) {
    const re = RenderingManager.getEngine();
    if (!re) return;
    const vp = re.getViewport(viewportId) as Types.IVolumeViewport;
    if (vp) {
       // logic to set camera focal point to worldPos
    }
  }

  getPosition(): number[] {
    return this.currentWorldPosition;
  }
}

export const CrosshairService = new CrosshairServiceImpl();
