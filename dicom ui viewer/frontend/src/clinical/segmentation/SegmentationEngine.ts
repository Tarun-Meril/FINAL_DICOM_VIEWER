import { Vector3 } from '../../../3d/math/Vector3';
import { LabelManager, LabelMap } from './labels/LabelMap';
import { ThresholdSegmentation } from './algorithms/ThresholdSegmentation';
import { RegionGrowing } from './algorithms/RegionGrowing';
import { BrushEditor } from './editing/BrushEditor';
import { SurfaceGenerator, SurfaceTriangleMesh } from './surface/SurfaceGenerator';
import { QuantificationEngine, QuantitativeSegmentStats } from './quantification/QuantificationEngine';

export class SegmentationEngine {
  public labelManager = new LabelManager();

  public createLabelMap(dimensions: Vector3): LabelMap {
    return this.labelManager.createLabelMap(dimensions);
  }

  public thresholdSegment(scalarData: Int16Array, dims: Vector3, minHu: number, maxHu: number, segmentId = 1): number {
    if (!this.labelManager.activeLabelMap) this.createLabelMap(dims);
    return ThresholdSegmentation.applyThreshold(scalarData, dims, minHu, maxHu, this.labelManager.activeLabelMap!, segmentId);
  }

  public regionGrowSegment(scalarData: Int16Array, dims: Vector3, seed: Vector3, toleranceHu: number, segmentId = 1): number {
    if (!this.labelManager.activeLabelMap) this.createLabelMap(dims);
    return RegionGrowing.grow3D(scalarData, dims, seed, toleranceHu, this.labelManager.activeLabelMap!, segmentId);
  }

  public paintBrush(center: Vector3, radius: number, segmentId = 1): void {
    if (this.labelManager.activeLabelMap) {
      BrushEditor.paintSphere(this.labelManager.activeLabelMap, center, radius, segmentId);
    }
  }

  public generateSurfaceMesh(segmentId = 1): SurfaceTriangleMesh | null {
    if (!this.labelManager.activeLabelMap) return null;
    return SurfaceGenerator.generateSurfaceMesh(this.labelManager.activeLabelMap, segmentId);
  }

  public computeStatistics(scalarData: Int16Array, dims: Vector3, spacingMm: Vector3, segmentId = 1): QuantitativeSegmentStats | null {
    if (!this.labelManager.activeLabelMap) return null;
    return QuantificationEngine.computeSegmentStatistics(scalarData, dims, spacingMm, this.labelManager.activeLabelMap, segmentId);
  }
}

export class SegmentationManager {
  public engine = new SegmentationEngine();
}
