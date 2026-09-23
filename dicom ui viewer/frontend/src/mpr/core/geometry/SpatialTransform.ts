/**
 * SpatialTransform
 * ----------------
 * The single place where voxel indices and patient-space millimetres are
 * converted into one another. Every measurement, crosshair jump and reference
 * line in the application goes through this class, so there is exactly one
 * geometry assumption in the system and it is stated here:
 *
 *   world = origin + i * spacing.i * rowDirection
 *                  + j * spacing.j * columnDirection
 *                  + k * spacing.k * sliceNormal
 *
 * The basis (rowDirection, columnDirection, sliceNormal) is orthonormal and
 * right-handed by construction (see computeSliceNormal), which makes the
 * inverse transform a set of dot products rather than a matrix inversion and
 * makes mirrored anatomy geometrically impossible.
 */

import {
  add,
  dot,
  scale,
  sub,
  type Vec3,
} from '../math/vec';
import type { SeriesGeometry } from './types';

export type IndexCoordinate = readonly [number, number, number];

export class SpatialTransform {
  readonly origin: Vec3;
  readonly rowDirection: Vec3;
  readonly columnDirection: Vec3;
  readonly sliceNormal: Vec3;
  readonly spacing: readonly [number, number, number];
  readonly dimensions: readonly [number, number, number];

  constructor(geometry: SeriesGeometry) {
    this.origin = geometry.origin;
    this.rowDirection = geometry.rowDirection;
    this.columnDirection = geometry.columnDirection;
    this.sliceNormal = geometry.sliceNormal;
    this.spacing = geometry.spacing;
    this.dimensions = geometry.dimensions;
  }

  /** Voxel index (may be fractional) -> patient-space millimetres. */
  indexToWorld(index: IndexCoordinate): Vec3 {
    const [i, j, k] = index;
    return add(
      this.origin,
      add(
        scale(this.rowDirection, i * this.spacing[0]),
        add(
          scale(this.columnDirection, j * this.spacing[1]),
          scale(this.sliceNormal, k * this.spacing[2]),
        ),
      ),
    );
  }

  /** Patient-space millimetres -> fractional voxel index. */
  worldToIndex(world: Vec3): IndexCoordinate {
    const d = sub(world, this.origin);
    return [
      dot(d, this.rowDirection) / this.spacing[0],
      dot(d, this.columnDirection) / this.spacing[1],
      dot(d, this.sliceNormal) / this.spacing[2],
    ];
  }

  /** Nearest integer voxel index, clamped to the volume. */
  worldToNearestVoxel(world: Vec3): IndexCoordinate {
    const [i, j, k] = this.worldToIndex(world);
    return [
      clamp(Math.round(i), 0, this.dimensions[0] - 1),
      clamp(Math.round(j), 0, this.dimensions[1] - 1),
      clamp(Math.round(k), 0, this.dimensions[2] - 1),
    ];
  }

  isInsideVolume(world: Vec3, toleranceVoxels = 0.5): boolean {
    const idx = this.worldToIndex(world);
    for (let a = 0; a < 3; a++) {
      if (idx[a] < -toleranceVoxels) return false;
      if (idx[a] > this.dimensions[a] - 1 + toleranceVoxels) return false;
    }
    return true;
  }

  /** Clamp a world point into the volume without changing its in-plane meaning. */
  clampWorld(world: Vec3): Vec3 {
    const [i, j, k] = this.worldToIndex(world);
    return this.indexToWorld([
      clamp(i, 0, this.dimensions[0] - 1),
      clamp(j, 0, this.dimensions[1] - 1),
      clamp(k, 0, this.dimensions[2] - 1),
    ]);
  }

  /** Physical extent of the volume along each axis, mm. */
  get physicalSizeMm(): readonly [number, number, number] {
    return [
      (this.dimensions[0] - 1) * this.spacing[0],
      (this.dimensions[1] - 1) * this.spacing[1],
      (this.dimensions[2] - 1) * this.spacing[2],
    ];
  }

  /** The eight corners of the volume in patient space. */
  corners(): Vec3[] {
    const [nx, ny, nz] = this.dimensions;
    const out: Vec3[] = [];
    for (const i of [0, nx - 1]) {
      for (const j of [0, ny - 1]) {
        for (const k of [0, nz - 1]) {
          out.push(this.indexToWorld([i, j, k]));
        }
      }
    }
    return out;
  }

  /**
   * Slice index of a world point along an arbitrary plane normal, expressed in
   * that plane's own sampling pitch. Used by the slice-position readout of the
   * reformatted (coronal / sagittal) viewports, where "slice number" is a
   * property of the reformat, not of the source stack.
   */
  slicePositionAlong(world: Vec3, planeNormal: Vec3): number {
    return dot(world, planeNormal);
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
