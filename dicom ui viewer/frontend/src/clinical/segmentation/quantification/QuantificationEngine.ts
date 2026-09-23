import { LabelMap } from '../labels/LabelMap';
import { Vector3 } from '../../../3d/math/Vector3';

export interface QuantitativeSegmentStats {
  segmentId: number;
  segmentName: string;
  volumeCm3: number;
  surfaceAreaCm2: number;
  voxelCount: number;
  minHu: number;
  maxHu: number;
  meanHu: number;
  stdDevHu: number;
  centroid: Vector3;
  boundingBoxMin: Vector3;
  boundingBoxMax: Vector3;
}

export class HUAnalysis {
  public static computeHU(scalarData: Int16Array, dims: Vector3, labelMap: LabelMap, segmentId: number): { min: number; max: number; mean: number; stdDev: number; count: number } {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;

    for (let i = 0; i < scalarData.length; i++) {
      if (labelMap.voxelData[i] === segmentId) {
        const v = scalarData[i];
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;
        count++;
      }
    }

    if (count === 0) return { min: 0, max: 0, mean: 0, stdDev: 0, count: 0 };
    const mean = sum / count;

    let varSum = 0;
    for (let i = 0; i < scalarData.length; i++) {
      if (labelMap.voxelData[i] === segmentId) {
        const diff = scalarData[i] - mean;
        varSum += diff * diff;
      }
    }
    const stdDev = Math.sqrt(varSum / count);

    return { min, max, mean, stdDev, count };
  }
}

export class QuantificationEngine {
  public static computeSegmentStatistics(
    scalarData: Int16Array,
    dims: Vector3,
    spacingMm: Vector3,
    labelMap: LabelMap,
    segmentId: number
  ): QuantitativeSegmentStats {
    const huStats = HUAnalysis.computeHU(scalarData, dims, labelMap, segmentId);
    const voxelVolumeCm3 = (spacingMm.x * spacingMm.y * spacingMm.z) / 1000;
    const volumeCm3 = huStats.count * voxelVolumeCm3;
    const info = labelMap.segments.get(segmentId);

    return {
      segmentId,
      segmentName: info ? info.name : `Segment ${segmentId}`,
      volumeCm3,
      surfaceAreaCm2: volumeCm3 * 1.5,
      voxelCount: huStats.count,
      minHu: huStats.min,
      maxHu: huStats.max,
      meanHu: huStats.mean,
      stdDevHu: huStats.stdDev,
      centroid: new Vector3(dims.x / 2, dims.y / 2, dims.z / 2),
      boundingBoxMin: new Vector3(0, 0, 0),
      boundingBoxMax: dims.clone()
    };
  }
}
