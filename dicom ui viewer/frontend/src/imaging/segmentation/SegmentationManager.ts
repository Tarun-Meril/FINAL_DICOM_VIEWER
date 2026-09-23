/**
 * SegmentationManager Subsystem Orchestrator
 * Manages multiple segmentation objects, active segments, color maps, opacity, and locking
 */

import { IEngineContext, ISegment, ISegmentation, ISegmentationManager } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class SegmentationManager implements ISegmentationManager {
  private engineContext: IEngineContext;
  private segmentations: Map<string, ISegmentation> = new Map();

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public createSegmentation(label: string, volumeId: string): ISegmentation {
    const start = performance.now();
    const segmentationId = `seg-${Date.now()}`;
    const defaultSegment: ISegment = {
      segmentIndex: 1,
      label: 'Segment 1',
      color: [255, 0, 0, 255],
      opacity: 0.7,
      visible: true,
      locked: false,
      voxelCount: 0,
    };

    const segmentation: ISegmentation = {
      segmentationId,
      label: label || 'New Segmentation',
      volumeId,
      segments: [defaultSegment],
      activeSegmentIndex: 1,
    };

    this.segmentations.set(segmentationId, segmentation);
    this.engineContext.segmentationRepository?.saveSegmentation(segmentation);

    const duration = performance.now() - start;
    this.engineContext.performanceMonitor.recordInitMetric('segmentationCreateTimeMs', duration);
    this.engineContext.logger.info('Segmentation', `Created Segmentation ${segmentationId} ("${label}") for volume ${volumeId}`);

    this.engineContext.eventBus.emit(EngineEvents.SEGMENTATION_CREATED, {
      segmentationId,
      label,
      activeSegmentIndex: 1,
    });

    return segmentation;
  }

  public deleteSegmentation(segmentationId: string): void {
    this.segmentations.delete(segmentationId);
    this.engineContext.logger.info('Segmentation', `Deleted Segmentation ${segmentationId}`);
    this.engineContext.eventBus.emit(EngineEvents.SEGMENTATION_DELETED, { segmentationId });
  }

  public getSegmentation(segmentationId: string): ISegmentation | undefined {
    return this.segmentations.get(segmentationId);
  }

  public getAllSegmentations(): ISegmentation[] {
    return Array.from(this.segmentations.values());
  }

  public setSegmentVisibility(segmentationId: string, segmentIndex: number, visible: boolean): void {
    const seg = this.segmentations.get(segmentationId);
    if (seg) {
      const item = seg.segments.find((s) => s.segmentIndex === segmentIndex);
      if (item) {
        item.visible = visible;
        this.engineContext.eventBus.emit(EngineEvents.SEGMENTATION_VISIBILITY_CHANGED, {
          segmentationId,
          activeSegmentIndex: segmentIndex,
          visible,
        });
      }
    }
  }

  public setSegmentColor(segmentationId: string, segmentIndex: number, color: [number, number, number, number]): void {
    const seg = this.segmentations.get(segmentationId);
    if (seg) {
      const item = seg.segments.find((s) => s.segmentIndex === segmentIndex);
      if (item) {
        item.color = color;
        this.engineContext.eventBus.emit(EngineEvents.SEGMENTATION_UPDATED, { segmentationId });
      }
    }
  }
}
