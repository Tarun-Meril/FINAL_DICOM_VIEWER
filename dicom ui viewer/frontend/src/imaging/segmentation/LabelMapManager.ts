/**
 * LabelMapManager Subsystem
 * Manages 3D voxel labelmap TypedArray buffers for binary and multi-label segmentations
 */

import { IEngineContext, ILabelMapManager } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class LabelMapManager implements ILabelMapManager {
  private engineContext: IEngineContext;
  private labelMaps: Map<string, Uint8Array> = new Map();

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public createLabelMapVolume(segmentationId: string, dimensions: [number, number, number]): Uint8Array {
    const totalVoxels = dimensions[0] * dimensions[1] * dimensions[2];
    const buffer = new Uint8Array(totalVoxels);

    this.labelMaps.set(segmentationId, buffer);
    this.engineContext.logger.info('Segmentation', `Created LabelMap buffer (${dimensions.join('x')}, ${totalVoxels} voxels) for ${segmentationId}`);
    
    this.engineContext.eventBus.emit(EngineEvents.LABELMAP_UPDATED, { segmentationId });
    return buffer;
  }

  public getLabelMap(segmentationId: string): Uint8Array | undefined {
    return this.labelMaps.get(segmentationId);
  }
}
