/** Minimal dependency-free 3-vector / 3x3 helpers used by the DICOM geometry layer.
 *  Kept separate from the rendering stack so `src/dicom` never imports vtk.js. */

export type Vec3 = readonly [number, number, number];
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

export const v3 = (x: number, y: number, z: number): Vec3 => [x, y, z];

export function add(a: Vec3, b: Vec3): Vec3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function sub(a: Vec3, b: Vec3): Vec3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function scale(a: Vec3, s: number): Vec3 { return [a[0] * s, a[1] * s, a[2] * s]; }
export function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function length(a: Vec3): number { return Math.hypot(a[0], a[1], a[2]); }
export function distance(a: Vec3, b: Vec3): number { return length(sub(a, b)); }
export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  if (l === 0 || !Number.isFinite(l)) return [0, 0, 0];
  return [a[0] / l, a[1] / l, a[2] / l];
}
export function negate(a: Vec3): Vec3 { return [-a[0], -a[1], -a[2]]; }
export function approxEqual(a: Vec3, b: Vec3, eps = 1e-5): boolean {
  return Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps && Math.abs(a[2] - b[2]) <= eps;
}
/** Angle between two vectors in degrees (0..180). */
export function angleDeg(a: Vec3, b: Vec3): number {
  const la = length(a), lb = length(b);
  if (la === 0 || lb === 0) return NaN;
  const c = Math.min(1, Math.max(-1, dot(a, b) / (la * lb)));
  return (Math.acos(c) * 180) / Math.PI;
}
/** Angle at vertex `v` formed by rays to `a` and `b`, in degrees. */
export function angleAtVertexDeg(v: Vec3, a: Vec3, b: Vec3): number {
  return angleDeg(sub(a, v), sub(b, v));
}

/** m is row-major with ROWS = basis vectors (x-row, y-row, z-row). */
export function mat3FromRows(r0: Vec3, r1: Vec3, r2: Vec3): Mat3 {
  return [r0[0], r0[1], r0[2], r1[0], r1[1], r1[2], r2[0], r2[1], r2[2]];
}
/** vtk.js `setDirection` order: flat [iAxis(3), jAxis(3), kAxis(3)] — verified against
 *  vtkImageData.computeTransforms(), where direction[0..2] becomes column 0 of the
 *  column-major index→world matrix (i.e. the world direction of increasing index i). */
export type Direction9 = [number, number, number, number, number, number, number, number, number];
export function directionFlat(iAxis: Vec3, jAxis: Vec3, kAxis: Vec3): Direction9 {
  return [iAxis[0], iAxis[1], iAxis[2], jAxis[0], jAxis[1], jAxis[2], kAxis[0], kAxis[1], kAxis[2]];
}
/** Determinant of the 3x3 built from three axis vectors as rows. */
export function det3(a: Vec3, b: Vec3, c: Vec3): number { return dot(a, cross(b, c)); }

export function isOrthonormalBasis(a: Vec3, b: Vec3, c: Vec3, eps = 1e-3): boolean {
  return Math.abs(length(a) - 1) < eps && Math.abs(length(b) - 1) < eps && Math.abs(length(c) - 1) < eps &&
    Math.abs(dot(a, b)) < eps && Math.abs(dot(a, c)) < eps && Math.abs(dot(b, c)) < eps;
}

/** Transform a point by origin + M·(spacing∘index), M given as axis vectors. */
export function indexToWorld(
  index: Vec3, origin: Vec3, spacing: Vec3, iAxis: Vec3, jAxis: Vec3, kAxis: Vec3,
): Vec3 {
  const i = index[0] * spacing[0], j = index[1] * spacing[1], k = index[2] * spacing[2];
  return [
    origin[0] + iAxis[0] * i + jAxis[0] * j + kAxis[0] * k,
    origin[1] + iAxis[1] * i + jAxis[1] * j + kAxis[1] * k,
    origin[2] + iAxis[2] * i + jAxis[2] * j + kAxis[2] * k,
  ];
}

/** Inverse of `indexToWorld` for an orthonormal basis (projection onto each axis). */
export function worldToIndex(
  world: Vec3, origin: Vec3, spacing: Vec3, iAxis: Vec3, jAxis: Vec3, kAxis: Vec3,
): Vec3 {
  const d = sub(world, origin);
  return [dot(d, iAxis) / spacing[0], dot(d, jAxis) / spacing[1], dot(d, kAxis) / spacing[2]];
}
