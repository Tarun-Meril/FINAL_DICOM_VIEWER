import type { VolumeData } from '@3d/volume/types';
import type { LabelId, LabelStats } from './types';

/**
 * A derived label volume, parallel to the source scalars. 1 byte per voxel supports
 * up to 255 concurrent segmentation objects. The source volume is never touched (§28).
 */
export class LabelVolume {
  readonly labels: Uint8Array;
  readonly dims: readonly [number, number, number];

  constructor(dims: readonly [number, number, number], existing?: Uint8Array) {
    this.dims = dims;
    const n = dims[0] * dims[1] * dims[2];
    this.labels = existing && existing.length === n ? existing : new Uint8Array(n);
  }

  get length(): number { return this.labels.length; }

  index(i: number, j: number, k: number): number {
    return (k * this.dims[1] + j) * this.dims[0] + i;
  }

  clearLabel(id: LabelId): number {
    let n = 0;
    for (let p = 0; p < this.labels.length; p++) if (this.labels[p] === id) { this.labels[p] = 0; n++; }
    return n;
  }

  stats(id: LabelId, volume: VolumeData): LabelStats {
    const [nx, ny, nz] = this.dims;
    const sxy = nx * ny;
    let count = 0, sum = 0, min = Infinity, max = -Infinity;
    let iMin = nx, iMax = -1, jMin = ny, jMax = -1, kMin = nz, kMax = -1;
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        const row = k * sxy + j * nx;
        for (let i = 0; i < nx; i++) {
          if (this.labels[row + i] !== id) continue;
          count++;
          const hu = volume.scalars[row + i];
          sum += hu; if (hu < min) min = hu; if (hu > max) max = hu;
          if (i < iMin) iMin = i; if (i > iMax) iMax = i;
          if (j < jMin) jMin = j; if (j > jMax) jMax = j;
          if (k < kMin) kMin = k; if (k > kMax) kMax = k;
        }
      }
    }
    const sp = volume.geometry.spacing;
    return {
      voxelCount: count,
      volumeMm3: count * sp[0] * sp[1] * sp[2],
      bounds: count > 0 ? [iMin, iMax, jMin, jMax, kMin, kMax] : null,
      meanHU: count > 0 ? sum / count : NaN,
      minHU: count > 0 ? min : NaN,
      maxHU: count > 0 ? max : NaN,
    };
  }

  /** Extract a single label as a binary mask suitable for surface extraction. */
  binary(id: LabelId): Uint8Array {
    const out = new Uint8Array(this.labels.length);
    for (let p = 0; p < this.labels.length; p++) out[p] = this.labels[p] === id ? 1 : 0;
    return out;
  }

  countsByLabel(): Map<LabelId, number> {
    const m = new Map<LabelId, number>();
    for (let p = 0; p < this.labels.length; p++) {
      const v = this.labels[p];
      if (v !== 0) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return m;
  }
}

/**
 * The rendering-exclusion mask. 1 = the voxel participates in rendering, 0 = removed
 * by a sculpt, crop or bone-removal operation. This is what makes those operations
 * non-destructive: the source scalars are untouched and the mask can be reset.
 */
export class VisibilityMask {
  readonly values: Uint8Array;
  constructor(length: number, existing?: Uint8Array) {
    this.values = existing && existing.length === length ? existing : new Uint8Array(length).fill(1);
  }
  reset(): void { this.values.fill(1); }
  removedCount(): number {
    let n = 0;
    for (let i = 0; i < this.values.length; i++) if (this.values[i] === 0) n++;
    return n;
  }
  invert(): void {
    for (let i = 0; i < this.values.length; i++) this.values[i] = this.values[i] ? 0 : 1;
  }
}

/**
 * Apply the visibility mask to the source scalars, producing the DERIVED array that is
 * uploaded to the GPU. `out` is reused between calls to avoid reallocating 100+ MB, and
 * the hidden-voxel count comes out of the same pass rather than costing a second one.
 */
export function applyVisibility(
  source: Int16Array, mask: Uint8Array, out: Int16Array, background: number,
): { hidden: number } {
  let hidden = 0;
  for (let i = 0; i < source.length; i++) {
    if (mask[i]) out[i] = source[i];
    else { out[i] = background; hidden++; }
  }
  return { hidden };
}
