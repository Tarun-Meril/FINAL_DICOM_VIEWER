/**
 * SegmentationRepository Tracker
 * In-memory repository for storing and querying Segmentation models
 */

import { ISegmentation, ISegmentationRepository } from '../types/contracts';

export class SegmentationRepository implements ISegmentationRepository {
  private repoMap: Map<string, ISegmentation> = new Map();

  public saveSegmentation(segmentation: ISegmentation): void {
    if (!segmentation || !segmentation.segmentationId) return;
    this.repoMap.set(segmentation.segmentationId, segmentation);
  }

  public getSegmentation(segmentationId: string): ISegmentation | undefined {
    return this.repoMap.get(segmentationId);
  }

  public clear(): void {
    this.repoMap.clear();
  }
}
