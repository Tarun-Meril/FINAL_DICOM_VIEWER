import { Vector3 } from '../../3d/math/Vector3';

export interface SegmentInfo {
  id: number;
  name: string;
  category: string;
  color: [number, number, number]; // Normalized RGB [0..1]
  opacity: number;
  visible: boolean;
  locked: boolean;
}

export class LabelMap {
  public dimensions: Vector3;
  public voxelData: Uint8Array; // Segment IDs (0 = background)
  public segments = new Map<number, SegmentInfo>();

  constructor(dims: Vector3) {
    this.dimensions = dims;
    this.voxelData = new Uint8Array(dims.x * dims.y * dims.z);
  }

  public addSegment(info: SegmentInfo): void {
    this.segments.set(info.id, info);
  }

  public getVoxel(x: number, y: number, z: number): number {
    const idx = z * this.dimensions.x * this.dimensions.y + y * this.dimensions.x + x;
    return this.voxelData[idx] ?? 0;
  }

  public setVoxel(x: number, y: number, z: number, segmentId: number): void {
    const idx = z * this.dimensions.x * this.dimensions.y + y * this.dimensions.x + x;
    if (idx >= 0 && idx < this.voxelData.length) {
      this.voxelData[idx] = segmentId;
    }
  }
}

export class SegmentHierarchy {
  public rootCategory = 'Anatomy';
}

export class LabelManager {
  public activeLabelMap: LabelMap | null = null;
  public activeSegmentId = 1;

  public createLabelMap(dims: Vector3): LabelMap {
    this.activeLabelMap = new LabelMap(dims);
    this.activeLabelMap.addSegment({
      id: 1,
      name: 'Left Kidney',
      category: 'Abdomen',
      color: [0.9, 0.2, 0.2],
      opacity: 0.7,
      visible: true,
      locked: false
    });
    this.activeLabelMap.addSegment({
      id: 2,
      name: 'Right Kidney',
      category: 'Abdomen',
      color: [0.2, 0.9, 0.2],
      opacity: 0.7,
      visible: true,
      locked: false
    });
    return this.activeLabelMap;
  }
}
