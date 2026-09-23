/**
 * AIOverlayManager Subsystem
 * Manages 2D/3D visual AI overlays (bounding boxes, heatmaps, segmentations)
 */

import { IEngineContext } from '../types/contracts';

export class AIOverlayManager {
  private engineContext: IEngineContext;
  private overlaysVisible: boolean = true;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public setVisibility(visible: boolean): void {
    this.overlaysVisible = visible;
    this.engineContext.logger.debug('AI', `AI visual overlays set to ${visible ? 'visible' : 'hidden'}`);
  }

  public isVisible(): boolean {
    return this.overlaysVisible;
  }
}
