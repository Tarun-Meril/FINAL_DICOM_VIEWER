import { Vector3 } from '../../3d/math/Vector3';

export class ObliqueMPR {
  public origin = new Vector3(0, 0, 0);
  public normal = new Vector3(0, 0, 1);
  public up = new Vector3(0, 1, 0);
  public right = new Vector3(1, 0, 0);
  public pitchDeg = 0;
  public rollDeg = 0;

  public setRotation(pitch: number, roll: number): void {
    this.pitchDeg = pitch;
    this.rollDeg = roll;
  }
}

export type SlabMode = 'average' | 'mip' | 'minip';

export class ThickSlab {
  public slabThicknessMm = 10;
  public slabMode: SlabMode = 'mip';

  public computeSlabVoxel(samples: number[], mode: SlabMode): number {
    if (samples.length === 0) return -1024;
    if (mode === 'mip') return Math.max(...samples);
    if (mode === 'minip') return Math.min(...samples);
    // Average
    return samples.reduce((a, b) => a + b, 0) / samples.length;
  }
}

export class SliceResampler {
  public resampleSlice(volumeData: Int16Array, dims: Vector3, plane: ObliqueMPR): Int16Array {
    return new Int16Array(512 * 512);
  }
}

export class MPRManager {
  public oblique = new ObliqueMPR();
  public slab = new ThickSlab();
  public resampler = new SliceResampler();
}
