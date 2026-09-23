import { LabelMap } from '../labels/LabelMap';

export class SliceInterpolation {
  public static interpolateBetweenSlices(labelMap: LabelMap, sliceIndex1: number, sliceIndex2: number, segmentId: number): void {
    // Interpolate shape contours between slice1 and slice2
  }
}

export class SegmentationValidator {
  public static validateMask(labelMap: LabelMap): { valid: boolean; empty: boolean; warnings: string[] } {
    let nonZero = 0;
    for (let i = 0; i < labelMap.voxelData.length; i++) {
      if (labelMap.voxelData[i] > 0) nonZero++;
    }

    return {
      valid: true,
      empty: nonZero === 0,
      warnings: nonZero === 0 ? ['Segmentation mask is completely empty.'] : []
    };
  }
}
