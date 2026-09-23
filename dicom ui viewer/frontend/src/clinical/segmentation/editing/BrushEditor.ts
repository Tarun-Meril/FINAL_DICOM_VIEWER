import { Vector3 } from '../../../3d/math/Vector3';
import { LabelMap } from '../labels/LabelMap';

export class BrushEditor {
  public static paintSphere(
    targetLabelMap: LabelMap,
    center: Vector3,
    radiusVoxels: number,
    segmentId: number
  ): void {
    const { dimensions } = targetLabelMap;
    const r2 = radiusVoxels * radiusVoxels;

    const minX = Math.max(0, Math.floor(center.x - radiusVoxels));
    const maxX = Math.min(dimensions.x - 1, Math.ceil(center.x + radiusVoxels));
    const minY = Math.max(0, Math.floor(center.y - radiusVoxels));
    const maxY = Math.min(dimensions.y - 1, Math.ceil(center.y + radiusVoxels));
    const minZ = Math.max(0, Math.floor(center.z - radiusVoxels));
    const maxZ = Math.min(dimensions.z - 1, Math.ceil(center.z + radiusVoxels));

    for (let z = minZ; z <= maxZ; z++) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const dx = x - center.x;
          const dy = y - center.y;
          const dz = z - center.z;
          if (dx * dx + dy * dy + dz * dz <= r2) {
            targetLabelMap.setVoxel(x, y, z, segmentId);
          }
        }
      }
    }
  }

  public static eraseSphere(targetLabelMap: LabelMap, center: Vector3, radiusVoxels: number): void {
    this.paintSphere(targetLabelMap, center, radiusVoxels, 0);
  }
}

export class Morphology {
  public static dilate(targetLabelMap: LabelMap, segmentId: number): void {}
  public static erode(targetLabelMap: LabelMap, segmentId: number): void {}
  public static closing(targetLabelMap: LabelMap, segmentId: number): void {}
  public static opening(targetLabelMap: LabelMap, segmentId: number): void {}
}

export class IslandRemoval {
  public static removeIslands(targetLabelMap: LabelMap, minVolumeVoxels = 100): void {}
}
