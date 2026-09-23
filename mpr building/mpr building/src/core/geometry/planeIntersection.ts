/**
 * Plane-plane intersection for clinical reference lines.
 *
 * Reference lines are the exact geometric intersection of two viewing planes
 * in patient space. They are never approximated from slice indices or from a
 * percentage of the viewport, because those approximations drift as soon as
 * the data is oblique, anisotropic or panned.
 */

import {
  add,
  cross,
  dot,
  length,
  normalize,
  scale,
  sub,
  type Vec3,
} from '../math/vec';

export interface Plane {
  /** Unit normal in patient space. */
  readonly normal: Vec3;
  /** Any point known to lie on the plane, in patient space. */
  readonly point: Vec3;
}

export interface Line3D {
  readonly point: Vec3;
  /** Unit direction. */
  readonly direction: Vec3;
}

/** Signed distance from the origin to the plane along its normal. */
export function planeOffset(plane: Plane): number {
  return dot(plane.normal, plane.point);
}

/**
 * Intersection line of two planes, or null when the planes are parallel.
 *
 * Solves for the point on the line closest to the world origin:
 *   p = ( d1 * (n2 x d) + d2 * (d x n1) ) / |d|^2,  where d = n1 x n2
 * and d1, d2 are the planes' offsets along their own normals. The result is
 * the point of the intersection line closest to the world origin.
 */
export function intersectPlanes(a: Plane, b: Plane, parallelEps = 1e-8): Line3D | null {
  const dir = cross(a.normal, b.normal);
  const denom = dot(dir, dir);
  if (denom < parallelEps) return null;

  const d1 = planeOffset(a);
  const d2 = planeOffset(b);

  const p = scale(
    add(scale(cross(b.normal, dir), d1), scale(cross(dir, a.normal), d2)),
    1 / denom,
  );

  return { point: p, direction: normalize(dir) };
}

/**
 * Clip a 3D line to an axis-independent rectangular slab defined in the plane
 * of a viewport. `halfExtents` are measured along `basisU` and `basisV` from
 * `centre`. Returns the two endpoints in patient space, or null when the line
 * misses the rectangle.
 *
 * This is used to draw a reference line exactly across the visible portion of
 * a viewport, with no reliance on screen-space heuristics.
 */
export function clipLineToRect(
  line: Line3D,
  centre: Vec3,
  basisU: Vec3,
  basisV: Vec3,
  halfExtents: readonly [number, number],
): [Vec3, Vec3] | null {
  // Parameterise the line as point + t * direction and intersect with the four
  // edge constraints |(P - centre) . u| <= hu and |(P - centre) . v| <= hv.
  const rel = sub(line.point, centre);
  let tMin = -Infinity;
  let tMax = Infinity;

  const constraints: Array<[Vec3, number]> = [
    [basisU, halfExtents[0]],
    [basisV, halfExtents[1]],
  ];

  for (const [axis, half] of constraints) {
    const o = dot(rel, axis);
    const d = dot(line.direction, axis);
    if (Math.abs(d) < 1e-12) {
      if (Math.abs(o) > half) return null; // parallel and outside
      continue;
    }
    const t1 = (-half - o) / d;
    const t2 = (half - o) / d;
    const lo = Math.min(t1, t2);
    const hi = Math.max(t1, t2);
    if (lo > tMin) tMin = lo;
    if (hi < tMax) tMax = hi;
    if (tMin > tMax) return null;
  }

  if (!Number.isFinite(tMin) || !Number.isFinite(tMax)) return null;

  return [
    add(line.point, scale(line.direction, tMin)),
    add(line.point, scale(line.direction, tMax)),
  ];
}

/** Perpendicular distance from a point to a plane (signed, along the normal). */
export function signedDistanceToPlane(point: Vec3, plane: Plane): number {
  return dot(sub(point, plane.point), plane.normal);
}

/** Orthogonal projection of a world point onto a plane. */
export function projectPointOntoPlane(point: Vec3, plane: Plane): Vec3 {
  return sub(point, scale(plane.normal, signedDistanceToPlane(point, plane)));
}

/**
 * Move a plane so that it passes through `target`, keeping its normal. This is
 * the operation behind "clicking a lesion in axial re-slices coronal and
 * sagittal": only the plane offset changes, never the volume.
 */
export function planeThrough(target: Vec3, normal: Vec3): Plane {
  return { normal: normalize(normal), point: target };
}

/** Distance between two parallel planes; NaN when they are not parallel. */
export function parallelPlaneDistance(a: Plane, b: Plane): number {
  if (length(cross(a.normal, b.normal)) > 1e-6) return NaN;
  return Math.abs(planeOffset(b) - planeOffset(a) * Math.sign(dot(a.normal, b.normal)));
}
