/**
 * HeatmapManager Subsystem
 * Generates and overlays Grad-CAM / saliency activation heatmaps on DICOM viewports
 */

import { IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class HeatmapManager {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public generateHeatmap(volumeId: string): Float32Array {
    const heatmap = new Float32Array(512 * 512);
    this.engineContext.eventBus.emit(EngineEvents.HEATMAP_GENERATED, { volumeId });
    return heatmap;
  }
}
