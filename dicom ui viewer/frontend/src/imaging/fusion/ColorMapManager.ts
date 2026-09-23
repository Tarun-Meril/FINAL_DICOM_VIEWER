/**
 * ColorMapManager Subsystem
 * Clinical PET/CT & Multi-Modality Color Maps (Hot Iron, Rainbow, Gray, Spectral)
 */

import { IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class ColorMapManager {
  private engineContext: IEngineContext;
  private currentColorMap: string = 'PET-HotIron';

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public setColorMap(colorMap: string): void {
    this.currentColorMap = colorMap;
    this.engineContext.logger.info('Fusion', `Fusion color map set to ${colorMap}`);
    this.engineContext.eventBus.emit(EngineEvents.COLORMAP_CHANGED, { colorMap });
  }

  public getColorMap(): string {
    return this.currentColorMap;
  }
}
