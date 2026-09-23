/**
 * EraserToolController Subsystem
 * Interactive voxel erasing controller for labelmaps
 */

import { IEngineContext } from '../types/contracts';

export class EraserToolController {
  private engineContext: IEngineContext;
  private eraserRadius: number = 10;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public setRadius(radius: number): void {
    this.eraserRadius = Math.max(1, radius);
  }

  public erase(segmentationId: string, voxelCoords: [number, number, number]): void {
    this.engineContext.logger.debug('Segmentation', `Erasing voxel at [${voxelCoords.join(', ')}]`);
  }
}
