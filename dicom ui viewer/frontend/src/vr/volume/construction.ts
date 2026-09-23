/**
 * Volume construction (§6).
 *
 * Builds a rectilinear voxel volume in DICOM patient (LPS) world coordinates from
 * geometrically sorted slices. Three reconstruction strategies, chosen by
 * `analyzeGeometry`, are implemented explicitly and recorded in the provenance:
 *
 *   regular            slices already sit on a uniform grid → direct write
 *   resample-irregular slices are unevenly spaced or have gaps → linear resample
 *                      along the slice axis onto a uniform grid
 *   shear-correct      a tilted gantry sheared the stack → per-slice in-plane
 *                      translation onto an orthogonal grid, then as above
 *
 * The source DICOM bytes are never modified; this produces a new derived array.
 */
import { dot, sub, type Vec3 } from '@3d/math/vec3';
import type { GeometryAnalysis, VolumeGeometry, SliceRef } from '@3d/dicom/geometry';
import type { AppliedTransform } from './types';

export interface SliceWrite {
  /** HU values for one slice, length rows*columns, in row-major (i fastest) order. */
  readonly values: Int16Array;
  readonly slice: SliceRef;
}

export interface BuilderResult {
  readonly scalars: Int16Array;
  readonly transforms: readonly AppliedTransform[];
  readonly writtenSlices: number;
  readonly interpolatedSlices: number;
}

/** Value written where no source data exists (outside the scanned range). */
export const BACKGROUND_HU = -1024;

/**
 * Streaming volume builder. Slices must be pushed in ascending slice-coordinate
 * order — the same order `analyzeGeometry` produced.
 */
export class VolumeBuilder {
  private readonly scalars: Int16Array;
  private readonly nx: number;
  private readonly ny: number;
  private readonly nz: number;
  private readonly sliceSize: number;
  private readonly transforms: AppliedTransform[] = [];

  private prev: { values: Int16Array; coord: number } | null = null;
  private nextTargetK = 0;
  private written = 0;
  private interpolated = 0;
  /** Target slice indices already populated (guards against duplicate positions). */
  private readonly filled = new Set<number>();

  constructor(
    private readonly geometry: VolumeGeometry,
    private readonly analysis: GeometryAnalysis,
  ) {
    [this.nx, this.ny, this.nz] = geometry.dimensions;
    this.sliceSize = this.nx * this.ny;
    this.scalars = new Int16Array(this.sliceSize * this.nz);
    this.scalars.fill(BACKGROUND_HU);

    if (analysis.strategy === 'resample-irregular') {
      this.transforms.push({
        kind: 'slice-resample',
        description: 'Slices were linearly resampled along the slice axis onto a uniform grid because the acquired spacing was irregular.',
        parameters: {
          targetSpacingMm: geometry.spacing[2],
          measuredMinMm: analysis.stats.spacingMin,
          measuredMaxMm: analysis.stats.spacingMax,
          measuredMedianMm: analysis.stats.spacingMedian,
        },
      });
    }
    if (analysis.strategy === 'shear-correct') {
      this.transforms.push({
        kind: 'shear-correction',
        description: 'A tilted acquisition was de-sheared: each slice was translated in-plane so the stack became orthogonal before resampling.',
        parameters: { shearDeg: analysis.stats.stackShearDeg },
      });
    }
  }

  /** World coordinate along the k axis of target slice index k. */
  private targetCoord(k: number): number {
    return this.origin0 + k * this.geometry.spacing[2];
  }

  private get origin0(): number {
    return dot(this.geometry.origin, this.geometry.kAxis);
  }

  /**
   * In-plane offset (in voxels) of a source slice relative to the orthogonal target
   * grid. Non-zero only for tilted acquisitions.
   */
  private inPlaneOffset(slice: SliceRef): [number, number] {
    if (this.analysis.strategy !== 'shear-correct') return [0, 0];
    const k = dot(sub(slice.position, this.geometry.origin), this.geometry.kAxis);
    const idealOrigin: Vec3 = [
      this.geometry.origin[0] + this.geometry.kAxis[0] * k,
      this.geometry.origin[1] + this.geometry.kAxis[1] * k,
      this.geometry.origin[2] + this.geometry.kAxis[2] * k,
    ];
    const d = sub(slice.position, idealOrigin);
    return [dot(d, this.geometry.iAxis) / this.geometry.spacing[0], dot(d, this.geometry.jAxis) / this.geometry.spacing[1]];
  }

  /** Bilinear in-plane shift; identity fast-path when the offset is zero. */
  private shiftInPlane(values: Int16Array, du: number, dv: number): Int16Array {
    if (Math.abs(du) < 1e-6 && Math.abs(dv) < 1e-6) return values;
    const out = new Int16Array(this.sliceSize);
    const nx = this.nx, ny = this.ny;
    for (let y = 0; y < ny; y++) {
      const sy = y + dv;
      const y0 = Math.floor(sy); const fy = sy - y0;
      for (let x = 0; x < nx; x++) {
        const sx = x + du;
        const x0 = Math.floor(sx); const fx = sx - x0;
        const x1 = x0 + 1, y1 = y0 + 1;
        const inBounds = x0 >= 0 && y0 >= 0 && x1 < nx && y1 < ny;
        if (!inBounds) { out[y * nx + x] = BACKGROUND_HU; continue; }
        const v00 = values[y0 * nx + x0], v10 = values[y0 * nx + x1];
        const v01 = values[y1 * nx + x0], v11 = values[y1 * nx + x1];
        const top = v00 + (v10 - v00) * fx;
        const bot = v01 + (v11 - v01) * fx;
        out[y * nx + x] = Math.round(top + (bot - top) * fy) | 0;
      }
    }
    return out;
  }

  private writeTarget(k: number, values: Int16Array): void {
    if (k < 0 || k >= this.nz) return;
    this.scalars.set(values, k * this.sliceSize);
  }

  private lerpInto(k: number, a: Int16Array, b: Int16Array, t: number): void {
    const off = k * this.sliceSize;
    for (let i = 0; i < this.sliceSize; i++) {
      this.scalars[off + i] = Math.round(a[i] + (b[i] - a[i]) * t) | 0;
    }
  }

  push(write: SliceWrite): void {
    const [du, dv] = this.inPlaneOffset(write.slice);
    const values = this.shiftInPlane(write.values, du, dv);
    const coord = write.slice.coordinate;

    if (this.analysis.strategy === 'regular') {
      const k = Math.round((coord - this.origin0) / this.geometry.spacing[2]);
      // A duplicate position must not overwrite the slice already placed there.
      if (k >= 0 && k < this.nz && this.filled.has(k)) return;
      this.writeTarget(k, values);
      this.filled.add(k);
      this.written++;
      return;
    }

    // Resampling path: fill every target slice whose coordinate falls in
    // [prev.coord, coord] by linear interpolation between the two source slices.
    if (this.prev === null) {
      while (this.nextTargetK < this.nz && this.targetCoord(this.nextTargetK) < coord - 1e-6) this.nextTargetK++;
      if (this.nextTargetK < this.nz && Math.abs(this.targetCoord(this.nextTargetK) - coord) < 1e-6) {
        this.writeTarget(this.nextTargetK, values);
        this.written++;
        this.nextTargetK++;
      }
      this.prev = { values, coord };
      return;
    }

    const span = coord - this.prev.coord;
    while (this.nextTargetK < this.nz) {
      const tc = this.targetCoord(this.nextTargetK);
      if (tc > coord + 1e-6) break;
      if (tc < this.prev.coord - 1e-6) { this.nextTargetK++; continue; }
      const t = span > 1e-9 ? (tc - this.prev.coord) / span : 0;
      if (t <= 1e-6) { this.writeTarget(this.nextTargetK, this.prev.values); this.written++; }
      else if (t >= 1 - 1e-6) { this.writeTarget(this.nextTargetK, values); this.written++; }
      else { this.lerpInto(this.nextTargetK, this.prev.values, values, t); this.interpolated++; }
      this.nextTargetK++;
    }
    this.prev = { values, coord };
  }

  finish(): BuilderResult {
    return {
      scalars: this.scalars,
      transforms: this.transforms,
      writtenSlices: this.written,
      interpolatedSlices: this.interpolated,
    };
  }
}
