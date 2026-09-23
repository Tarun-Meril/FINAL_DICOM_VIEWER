/**
 * Minimal, dependency-free linear algebra for DICOM patient-space geometry.
 *
 * CONVENTION (explicit, per production-safety rule):
 *   All vectors are expressed in the DICOM patient coordinate system (LPS):
 *     +x -> patient Left
 *     +y -> patient Posterior
 *     +z -> patient Superior
 *   Units are millimetres. No other coordinate convention is used anywhere in
 *   the geometry layer.
 */

export type Vec3 = readonly [number, number, number];
/** Column-major 3x3: [m00,m10,m20, m01,m11,m21, m02,m12,m22] */
export type Mat3 = readonly number[];

export const vec3 = (x: number, y: number, z: number): Vec3 => [x, y, z];

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function length(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

export function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  if (l === 0 || !Number.isFinite(l)) {
    throw new Error('Cannot normalize a zero-length or non-finite vector');
  }
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function negate(a: Vec3): Vec3 {
  return [-a[0], -a[1], -a[2]];
}

export function isFiniteVec(a: Vec3): boolean {
  return a.length === 3 && a.every((v) => Number.isFinite(v));
}

/** Angle between two vectors, in degrees. */
export function angleDeg(a: Vec3, b: Vec3): number {
  const c = dot(normalize(a), normalize(b));
  return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
}

/** Determinant of the 3x3 matrix whose COLUMNS are a, b, c. */
export function det3(a: Vec3, b: Vec3, c: Vec3): number {
  return dot(a, cross(b, c));
}

/**
 * Build a column-major 3x3 direction matrix from three basis vectors.
 * Columns are the i, j and k axis directions in patient space.
 */
export function mat3FromColumns(i: Vec3, j: Vec3, k: Vec3): Mat3 {
  return [i[0], i[1], i[2], j[0], j[1], j[2], k[0], k[1], k[2]];
}

export const EPS = 1e-6;

/** True when |a-b| <= tol for every component. */
export function vecApproxEqual(a: Vec3, b: Vec3, tol = 1e-4): boolean {
  return (
    Math.abs(a[0] - b[0]) <= tol &&
    Math.abs(a[1] - b[1]) <= tol &&
    Math.abs(a[2] - b[2]) <= tol
  );
}
