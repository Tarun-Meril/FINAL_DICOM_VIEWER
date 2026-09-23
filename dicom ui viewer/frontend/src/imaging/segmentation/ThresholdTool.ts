/**
 * ThresholdTool Subsystem
 * Hounsfield Unit (HU) lower/upper range thresholding tool for automatic voxel segmentation
 */

import { IEngineContext } from '../types/contracts';

export class ThresholdTool {
  private engineContext: IEngineContext;
  private lowerThreshold: number = 200;
  private upperThreshold: number = 2000;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public setRange(lower: number, upper: number): void {
    this.lowerThreshold = lower;
    this.upperThreshold = upper;
  }

  public applyThreshold(segmentationId: string, volumeId: string): void {
    this.engineContext.logger.info('Segmentation', `Applying HU threshold [${this.lowerThreshold}, ${this.upperThreshold}] on volume ${volumeId}`);
  }
}
