/**
 * SegmentationInferenceManager Subsystem
 * Automated AI organ and lesion segmentation mask generation wrapper
 */

import { IEngineContext, ISegmentation } from '../types/contracts';

export class SegmentationInferenceManager {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public async runAutoSegmentation(volumeId: string, organName: string): Promise<ISegmentation> {
    this.engineContext.logger.info('AI', `Running automated AI segmentation for ${organName} on volume ${volumeId}`);
    return this.engineContext.segmentationManager!.createSegmentation(`AI Auto-${organName}`, volumeId);
  }
}
