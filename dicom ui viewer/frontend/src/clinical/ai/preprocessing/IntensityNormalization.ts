import { Vector3 } from '../../../3d/math/Vector3';

export class IntensityNormalization {
  public static normalizeZScore(scalarData: Float32Array): Float32Array {
    let sum = 0;
    for (let i = 0; i < scalarData.length; i++) sum += scalarData[i];
    const mean = sum / (scalarData.length || 1);

    let varSum = 0;
    for (let i = 0; i < scalarData.length; i++) {
      const d = scalarData[i] - mean;
      varSum += d * d;
    }
    const stdDev = Math.sqrt(varSum / (scalarData.length || 1)) || 1.0;

    const normalized = new Float32Array(scalarData.length);
    for (let i = 0; i < scalarData.length; i++) {
      normalized[i] = (scalarData[i] - mean) / stdDev;
    }
    return normalized;
  }

  public static normalizeMinMax(scalarData: Float32Array, minHu = -1000, maxHu = 400): Float32Array {
    const range = maxHu - minHu || 1;
    const normalized = new Float32Array(scalarData.length);
    for (let i = 0; i < scalarData.length; i++) {
      const clamped = Math.min(maxHu, Math.max(minHu, scalarData[i]));
      normalized[i] = (clamped - minHu) / range;
    }
    return normalized;
  }
}

export interface VolumePatch3D {
  patchIndex: Vector3;
  boundsMin: Vector3;
  boundsMax: Vector3;
  data: Float32Array;
}

export class PatchGenerator {
  public static generateSlidingWindowPatches(
    scalarData: Float32Array,
    dims: Vector3,
    patchSize = new Vector3(64, 64, 64),
    stride = new Vector3(32, 32, 32)
  ): VolumePatch3D[] {
    const patches: VolumePatch3D[] = [];
    const patchLength = patchSize.x * patchSize.y * patchSize.z;

    for (let z = 0; z < dims.z; z += stride.z) {
      for (let y = 0; y < dims.y; y += stride.y) {
        for (let x = 0; x < dims.x; x += stride.x) {
          const patchData = new Float32Array(patchLength);
          patches.push({
            patchIndex: new Vector3(x / stride.x, y / stride.y, z / stride.z),
            boundsMin: new Vector3(x, y, z),
            boundsMax: new Vector3(Math.min(dims.x, x + patchSize.x), Math.min(dims.y, y + patchSize.y), Math.min(dims.z, z + patchSize.z)),
            data: patchData
          });
        }
      }
    }
    return patches;
  }
}
