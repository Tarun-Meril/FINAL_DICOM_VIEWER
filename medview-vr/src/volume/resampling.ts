/**
 * Optional resampling (§6). The source volume is never replaced — every function here
 * returns a NEW derived volume whose provenance records the transform that produced it.
 */
import type { VolumeData, AppliedTransform } from './types';
import type { VolumeGeometry } from '@/dicom/geometry';
import { computeStatistics } from './statistics';

/** Trilinear sample of a scalar grid at fractional index coordinates. */
export function sampleTrilinear(
  data: Int16Array, dims: readonly [number, number, number], x: number, y: number, z: number, outside = -1024,
): number {
  const [nx, ny, nz] = dims;
  if (x < 0 || y < 0 || z < 0 || x > nx - 1 || y > ny - 1 || z > nz - 1) return outside;
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const x1 = Math.min(x0 + 1, nx - 1), y1 = Math.min(y0 + 1, ny - 1), z1 = Math.min(z0 + 1, nz - 1);
  const fx = x - x0, fy = y - y0, fz = z - z0;
  const sxy = nx * ny;
  const i000 = z0 * sxy + y0 * nx + x0, i100 = z0 * sxy + y0 * nx + x1;
  const i010 = z0 * sxy + y1 * nx + x0, i110 = z0 * sxy + y1 * nx + x1;
  const i001 = z1 * sxy + y0 * nx + x0, i101 = z1 * sxy + y0 * nx + x1;
  const i011 = z1 * sxy + y1 * nx + x0, i111 = z1 * sxy + y1 * nx + x1;
  const c00 = data[i000] + (data[i100] - data[i000]) * fx;
  const c10 = data[i010] + (data[i110] - data[i010]) * fx;
  const c01 = data[i001] + (data[i101] - data[i001]) * fx;
  const c11 = data[i011] + (data[i111] - data[i011]) * fx;
  const c0 = c00 + (c10 - c00) * fy;
  const c1 = c01 + (c11 - c01) * fy;
  return c0 + (c1 - c0) * fz;
}

function derive(
  source: VolumeData, scalars: Int16Array, geometry: VolumeGeometry, transform: AppliedTransform, idSuffix: string,
): VolumeData {
  return {
    ...source,
    id: `${source.id}:${idSuffix}`,
    scalars,
    geometry,
    statistics: computeStatistics(scalars),
    provenance: { ...source.provenance, transforms: [...source.provenance.transforms, transform] },
  };
}

/**
 * Resample to (approximately) isotropic voxels. Only used when an operation needs it
 * — the renderer itself handles anisotropic voxels natively via the spacing it is given.
 */
export function resampleIsotropic(source: VolumeData, targetSpacingMm?: number): VolumeData {
  const g = source.geometry;
  const target = targetSpacingMm ?? Math.min(g.spacing[0], g.spacing[1], g.spacing[2]);
  if (Math.abs(g.spacing[0] - target) < 1e-6 && Math.abs(g.spacing[1] - target) < 1e-6 && Math.abs(g.spacing[2] - target) < 1e-6) {
    return source;
  }
  const dims: [number, number, number] = [
    Math.max(1, Math.round((g.dimensions[0] * g.spacing[0]) / target)),
    Math.max(1, Math.round((g.dimensions[1] * g.spacing[1]) / target)),
    Math.max(1, Math.round((g.dimensions[2] * g.spacing[2]) / target)),
  ];
  const out = new Int16Array(dims[0] * dims[1] * dims[2]);
  const sx = target / g.spacing[0], sy = target / g.spacing[1], sz = target / g.spacing[2];
  let p = 0;
  for (let k = 0; k < dims[2]; k++) {
    const zz = k * sz;
    for (let j = 0; j < dims[1]; j++) {
      const yy = j * sy;
      for (let i = 0; i < dims[0]; i++) out[p++] = Math.round(sampleTrilinear(source.scalars, g.dimensions, i * sx, yy, zz));
    }
  }
  const geometry: VolumeGeometry = {
    ...g, spacing: [target, target, target], dimensions: dims,
    physicalSize: [dims[0] * target, dims[1] * target, dims[2] * target],
  };
  return derive(source, out, geometry, {
    kind: 'isotropic-resample',
    description: `Resampled to isotropic ${target.toFixed(3)} mm voxels with trilinear interpolation.`,
    parameters: { originalSpacing: [...g.spacing], targetSpacing: [target, target, target], interpolation: 'trilinear' },
  }, `iso${target.toFixed(2)}`);
}

/**
 * Integer box-filter downsample used when the volume exceeds GPU limits (§26).
 * Box filtering (rather than point sampling) avoids aliasing bone edges into speckle.
 */
export function downsampleVolume(source: VolumeData, factor: readonly [number, number, number]): VolumeData {
  const [fx, fy, fz] = factor;
  if (fx === 1 && fy === 1 && fz === 1) return source;
  const g = source.geometry;
  const dims: [number, number, number] = [
    Math.max(1, Math.floor(g.dimensions[0] / fx)),
    Math.max(1, Math.floor(g.dimensions[1] / fy)),
    Math.max(1, Math.floor(g.dimensions[2] / fz)),
  ];
  const out = new Int16Array(dims[0] * dims[1] * dims[2]);
  const [nx, ny] = g.dimensions;
  const sxy = nx * ny;
  const boxN = fx * fy * fz;
  let p = 0;
  for (let k = 0; k < dims[2]; k++) {
    for (let j = 0; j < dims[1]; j++) {
      for (let i = 0; i < dims[0]; i++) {
        let acc = 0;
        for (let dz = 0; dz < fz; dz++) {
          const z = k * fz + dz;
          for (let dy = 0; dy < fy; dy++) {
            const rowOff = z * sxy + (j * fy + dy) * nx + i * fx;
            for (let dx = 0; dx < fx; dx++) acc += source.scalars[rowOff + dx];
          }
        }
        out[p++] = Math.round(acc / boxN);
      }
    }
  }
  const spacing: [number, number, number] = [g.spacing[0] * fx, g.spacing[1] * fy, g.spacing[2] * fz];
  // The centre of the new voxel (0,0,0) is offset from the old one by half a box.
  const shift = [(fx - 1) / 2 * g.spacing[0], (fy - 1) / 2 * g.spacing[1], (fz - 1) / 2 * g.spacing[2]];
  const origin: [number, number, number] = [
    g.origin[0] + g.iAxis[0] * shift[0] + g.jAxis[0] * shift[1] + g.kAxis[0] * shift[2],
    g.origin[1] + g.iAxis[1] * shift[0] + g.jAxis[1] * shift[1] + g.kAxis[1] * shift[2],
    g.origin[2] + g.iAxis[2] * shift[0] + g.jAxis[2] * shift[1] + g.kAxis[2] * shift[2],
  ];
  const geometry: VolumeGeometry = {
    ...g, origin, spacing, dimensions: dims,
    physicalSize: [dims[0] * spacing[0], dims[1] * spacing[1], dims[2] * spacing[2]],
  };
  return derive(source, out, geometry, {
    kind: 'downsample',
    description: `Box-filtered by ${fx}×${fy}×${fz} to fit GPU limits.`,
    parameters: { factor: [fx, fy, fz], resultingSpacing: spacing },
  }, `ds${fx}${fy}${fz}`);
}

/** Smallest integer factor that brings the volume under a voxel budget and texture cap. */
export function chooseDownsampleFactor(
  dims: readonly [number, number, number], maxVoxels: number, maxDim: number,
): [number, number, number] {
  let f: [number, number, number] = [1, 1, 1];
  const fits = () =>
    Math.floor(dims[0] / f[0]) * Math.floor(dims[1] / f[1]) * Math.floor(dims[2] / f[2]) <= maxVoxels &&
    Math.floor(dims[0] / f[0]) <= maxDim && Math.floor(dims[1] / f[1]) <= maxDim && Math.floor(dims[2] / f[2]) <= maxDim;
  let guard = 0;
  while (!fits() && guard++ < 8) {
    // Grow the factor on the currently largest physical axis first.
    const eff: [number, number, number] = [dims[0] / f[0], dims[1] / f[1], dims[2] / f[2]];
    const axis = eff.indexOf(Math.max(...eff)) as 0 | 1 | 2;
    f = [...f] as [number, number, number];
    f[axis] += 1;
  }
  return f;
}
