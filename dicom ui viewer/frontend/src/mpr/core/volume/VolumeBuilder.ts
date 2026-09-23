/**
 * VolumeBuilder
 * -------------
 * Turns a validated SeriesGeometry into a volume descriptor that the rendering
 * engine can consume, and (for tests and for the non-GPU path) into a packed
 * scalar buffer.
 *
 * Guarantees:
 *  - dimensions, voxel spacing, physical origin and direction come straight
 *    from the measured DICOM geometry, never from defaults;
 *  - voxel values are copied, never mutated in place;
 *  - one volume is produced per series and shared by all three viewports.
 */

import type { SeriesGeometry } from '../geometry/types';
import { SpatialTransform } from '../geometry/SpatialTransform';
import {
  applyRescale,
  resolveRescale,
  type IntensityUnits,
  type RescaleParameters,
} from './modality';

export type ScalarArray = Int16Array | Uint16Array | Float32Array;

export interface VolumeDescriptor {
  readonly volumeId: string;
  readonly geometry: SeriesGeometry;
  readonly transform: SpatialTransform;
  /** [columns, rows, slices] */
  readonly dimensions: readonly [number, number, number];
  /** [mm, mm, mm] along i, j, k */
  readonly spacing: readonly [number, number, number];
  readonly origin: readonly [number, number, number];
  /** Column-major 3x3, columns = i, j, k directions in patient space. */
  readonly direction: readonly number[];
  readonly modality: string;
  readonly rescale: RescaleParameters;
  readonly units: IntensityUnits;
  readonly numberOfVoxels: number;
  /** Estimated bytes for the packed scalar volume. */
  readonly estimatedBytes: number;
}

export function createVolumeDescriptor(
  volumeId: string,
  geometry: SeriesGeometry,
): VolumeDescriptor {
  if (geometry.verdict === 'unsafe') {
    throw new Error(
      'Refusing to build a volume from a series whose geometry was rejected. ' +
        'Inspect SeriesGeometry.issues and present the clinical message instead.',
    );
  }
  const reference = geometry.frames[0];
  const rescale = resolveRescale(
    geometry.modality,
    reference.rescaleSlope,
    reference.rescaleIntercept,
  );
  const [nx, ny, nz] = geometry.dimensions;
  const numberOfVoxels = nx * ny * nz;

  return {
    volumeId,
    geometry,
    transform: new SpatialTransform(geometry),
    dimensions: geometry.dimensions,
    spacing: geometry.spacing,
    origin: geometry.origin,
    direction: geometry.direction,
    modality: geometry.modality,
    rescale,
    units: rescale.units,
    numberOfVoxels,
    estimatedBytes: numberOfVoxels * 2,
  };
}

/** Supplies stored (un-rescaled) pixel values for one frame. */
export type FramePixelProvider = (
  frameIndexInVolume: number,
) => ArrayLike<number> | Promise<ArrayLike<number>>;

export interface AssembleOptions {
  /**
   * 'stored'  — keep the original stored values untouched (default).
   * 'modality'— apply Rescale Slope/Intercept into a NEW buffer, leaving the
   *             source data unmodified.
   */
  readonly output?: 'stored' | 'modality';
  readonly onProgress?: (completed: number, total: number) => void;
  /** Cooperative cancellation for long assemblies. */
  readonly signal?: { aborted: boolean };
}

export interface AssembledVolume {
  readonly descriptor: VolumeDescriptor;
  readonly scalarData: ScalarArray;
  readonly output: 'stored' | 'modality';
}

/**
 * Assemble the packed scalar volume in sorted patient-space order.
 *
 * Slices are written at the index the geometry layer assigned, so a series
 * delivered in reverse or shuffled order still produces a correctly ordered
 * volume. Yields between slices so the UI thread is never blocked.
 */
export async function assembleVolume(
  descriptor: VolumeDescriptor,
  provider: FramePixelProvider,
  options: AssembleOptions = {},
): Promise<AssembledVolume> {
  const output = options.output ?? 'stored';
  const [nx, ny, nz] = descriptor.dimensions;
  const sliceSize = nx * ny;

  const scalarData: ScalarArray =
    output === 'modality' && descriptor.rescale.slope % 1 !== 0
      ? new Float32Array(sliceSize * nz)
      : new Int16Array(sliceSize * nz);

  for (let k = 0; k < nz; k++) {
    if (options.signal?.aborted) {
      throw new Error('Volume assembly cancelled');
    }
    const pixels = await provider(k);
    if (pixels.length !== sliceSize) {
      throw new Error(
        `Frame ${k} contains ${pixels.length} samples but the volume geometry requires ${sliceSize}.`,
      );
    }
    const base = k * sliceSize;
    if (output === 'modality') {
      for (let p = 0; p < sliceSize; p++) {
        scalarData[base + p] = applyRescale(pixels[p], descriptor.rescale);
      }
    } else {
      for (let p = 0; p < sliceSize; p++) {
        scalarData[base + p] = pixels[p];
      }
    }
    options.onProgress?.(k + 1, nz);
    // Yield to the event loop so large studies never freeze the interface.
    if (k % 8 === 7) await Promise.resolve();
  }

  return { descriptor, scalarData, output };
}

/** Sample a voxel by integer index. Returns stored units. */
export function sampleVoxel(
  volume: AssembledVolume,
  i: number,
  j: number,
  k: number,
): number {
  const [nx, ny, nz] = volume.descriptor.dimensions;
  if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return NaN;
  return volume.scalarData[k * nx * ny + j * nx + i];
}

/**
 * Trilinear sample at a fractional voxel index. This is the interpolation the
 * reformat readouts use when reporting a value at an arbitrary patient-space
 * point; the GPU performs the equivalent sampling for display.
 */
export function sampleTrilinear(
  volume: AssembledVolume,
  index: readonly [number, number, number],
): number {
  const [nx, ny, nz] = volume.descriptor.dimensions;
  const [x, y, z] = index;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  if (x0 < 0 || y0 < 0 || z0 < 0 || x0 + 1 >= nx || y0 + 1 >= ny || z0 + 1 >= nz) {
    return sampleVoxel(volume, Math.round(x), Math.round(y), Math.round(z));
  }
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  const v = (i: number, j: number, k: number) => sampleVoxel(volume, i, j, k);

  const c00 = v(x0, y0, z0) * (1 - fx) + v(x0 + 1, y0, z0) * fx;
  const c10 = v(x0, y0 + 1, z0) * (1 - fx) + v(x0 + 1, y0 + 1, z0) * fx;
  const c01 = v(x0, y0, z0 + 1) * (1 - fx) + v(x0 + 1, y0, z0 + 1) * fx;
  const c11 = v(x0, y0 + 1, z0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1, z0 + 1) * fx;

  const c0 = c00 * (1 - fy) + c10 * fy;
  const c1 = c01 * (1 - fy) + c11 * fy;
  return c0 * (1 - fz) + c1 * fz;
}
