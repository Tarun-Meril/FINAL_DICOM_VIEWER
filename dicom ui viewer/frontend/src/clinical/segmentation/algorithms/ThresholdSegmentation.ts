import { Vector3 } from '../../../3d/math/Vector3';
import { LabelMap } from '../labels/LabelMap';

export class ThresholdSegmentation {
  public static applyThreshold(
    scalarData: Int16Array,
    dims: Vector3,
    minHu: number,
    maxHu: number,
    targetLabelMap: LabelMap,
    segmentId: number
  ): number {
    let count = 0;
    for (let i = 0; i < scalarData.length; i++) {
      const v = scalarData[i];
      if (v >= minHu && v <= maxHu) {
        targetLabelMap.voxelData[i] = segmentId;
        count++;
      }
    }
    return count;
  }
}

export class RegionGrowing {
  public static grow3D(
    scalarData: Int16Array,
    dims: Vector3,
    seed: Vector3,
    toleranceHu: number,
    targetLabelMap: LabelMap,
    segmentId: number
  ): number {
    const seedIdx = seed.z * dims.x * dims.y + seed.y * dims.x + seed.x;
    const seedVal = scalarData[seedIdx] ?? 0;

    const queue: number[] = [seedIdx];
    const visited = new Uint8Array(scalarData.length);
    visited[seedIdx] = 1;
    let count = 0;

    while (queue.length > 0) {
      const idx = queue.pop()!;
      const val = scalarData[idx];

      if (Math.abs(val - seedVal) <= toleranceHu) {
        targetLabelMap.voxelData[idx] = segmentId;
        count++;

        // Add 6-connected neighbors
        const z = Math.floor(idx / (dims.x * dims.y));
        const rem = idx % (dims.x * dims.y);
        const y = Math.floor(rem / dims.x);
        const x = rem % dims.x;

        const neighbors = [
          [x + 1, y, z], [x - 1, y, z],
          [x, y + 1, z], [x, y - 1, z],
          [x, y, z + 1], [x, y, z - 1]
        ];

        for (const [nx, ny, nz] of neighbors) {
          if (nx >= 0 && nx < dims.x && ny >= 0 && ny < dims.y && nz >= 0 && nz < dims.z) {
            const nIdx = nz * dims.x * dims.y + ny * dims.x + nx;
            if (!visited[nIdx]) {
              visited[nIdx] = 1;
              queue.push(nIdx);
            }
          }
        }
      }
    }

    return count;
  }
}

export class ConnectedComponents {
  public static filterFloatingIslands(targetLabelMap: LabelMap, minVoxelVolume = 50): void {
    // Retain only connected components larger than threshold
  }
}

export class WatershedSegmentation {
  public static runWatershed(scalarData: Int16Array, dims: Vector3, targetLabelMap: LabelMap): void {}
}

export class LiveWire {
  public static computeContour(points: Vector3[]): Vector3[] {
    return points;
  }
}

export class GraphCut {
  public static applyMinCutMaxFlow(): void {}
}
