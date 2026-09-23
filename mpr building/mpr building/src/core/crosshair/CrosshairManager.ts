/**
 * CrosshairManager / ReferenceLineManager
 * ---------------------------------------
 * Pure geometry behind synchronised crosshairs and reference lines. No
 * rendering-engine types appear here, which is what makes this logic directly
 * testable with numerical assertions rather than by visual comparison.
 *
 * Synchronisation model:
 *   - one world-space reference point, in millimetres;
 *   - each viewport shows the plane through that point with its own normal;
 *   - jumping a viewport to the reference point moves ONLY the plane offset
 *     (the component along that viewport's normal). The in-plane focal point,
 *     and therefore the user's pan and zoom, is preserved unless explicitly
 *     recentred.
 *
 * Because every viewport solves from the same Vec3, no pixel coordinate is
 * ever carried from one viewport to another and anatomical drift is
 * impossible.
 */

import {
  add,
  dot,
  scale,
  sub,
  type Vec3,
} from '../math/vec';
import {
  clipLineToRect,
  intersectPlanes,
  planeThrough,
  type Line3D,
  type Plane,
} from '../geometry/planeIntersection';
import {
  PLANE_CAMERAS,
  planeScreenRight,
  otherPlanes,
  type MPRPlane,
} from '../state/planes';

/** The plane a viewport is currently displaying. */
export function viewportPlane(plane: MPRPlane, referencePoint: Vec3): Plane {
  return planeThrough(referencePoint, PLANE_CAMERAS[plane].viewPlaneNormal);
}

/**
 * New camera focal point for a viewport so that it displays the slice
 * containing `referencePoint`.
 *
 * @param recentre  true  -> centre the view on the reference point (jump-to-point)
 *                  false -> change only the slice, preserving pan (crosshair drag)
 */
export function focalPointForReference(
  plane: MPRPlane,
  referencePoint: Vec3,
  currentFocalPoint: Vec3,
  recentre = false,
): Vec3 {
  if (recentre) return referencePoint;
  const n = PLANE_CAMERAS[plane].viewPlaneNormal;
  const delta = dot(sub(referencePoint, currentFocalPoint), n);
  return add(currentFocalPoint, scale(n, delta));
}

/**
 * Move the reference point by whole slices along a viewport's normal.
 * `pitchMm` is the reformat sampling pitch for that plane, derived from the
 * real volume spacing — never a fixed constant.
 */
export function stepReferencePoint(
  plane: MPRPlane,
  referencePoint: Vec3,
  steps: number,
  pitchMm: number,
): Vec3 {
  const n = PLANE_CAMERAS[plane].viewPlaneNormal;
  return add(referencePoint, scale(n, steps * pitchMm));
}

/**
 * Reformat sampling pitch for a plane: the distance you should travel per
 * slice step so that the reformat never over- or under-samples the volume.
 *
 * Computed as the magnitude of the volume's voxel step projected onto the
 * plane normal — i.e. the true through-plane resolution available to that
 * reformat, for anisotropic and oblique volumes alike.
 */
export function reformatPitchMm(
  plane: MPRPlane,
  volumeAxes: { i: Vec3; j: Vec3; k: Vec3 },
  spacing: readonly [number, number, number],
): number {
  const n = PLANE_CAMERAS[plane].viewPlaneNormal;
  const contributions = [
    Math.abs(dot(volumeAxes.i, n)) * spacing[0],
    Math.abs(dot(volumeAxes.j, n)) * spacing[1],
    Math.abs(dot(volumeAxes.k, n)) * spacing[2],
  ].filter((v) => v > 1e-9);
  if (contributions.length === 0) return Math.min(...spacing);
  // The finest real sampling available along the normal.
  return Math.min(...contributions);
}

export interface ReferenceLineSegment {
  readonly sourcePlane: MPRPlane;
  readonly start: Vec3;
  readonly end: Vec3;
}

export interface ViewportRect {
  /** World-space centre of the visible region (the camera focal point). */
  readonly centre: Vec3;
  /** Half width along screen-right, mm. */
  readonly halfWidthMm: number;
  /** Half height along screen-up, mm. */
  readonly halfHeightMm: number;
}

/**
 * Reference lines to draw INSIDE `plane`: the true intersections of the other
 * two viewing planes with this one, clipped to the visible region.
 *
 * Returns world-space endpoints. Mapping to canvas is the renderer's job, so
 * the lines stay correct through zoom, pan, resize and rotation without any
 * percentage-based fallback.
 */
export function referenceLinesForViewport(
  plane: MPRPlane,
  referencePoint: Vec3,
  rect: ViewportRect,
): ReferenceLineSegment[] {
  const thisPlane = viewportPlane(plane, referencePoint);
  const right = planeScreenRight(plane);
  const up = PLANE_CAMERAS[plane].viewUp;

  const segments: ReferenceLineSegment[] = [];
  for (const other of otherPlanes(plane)) {
    const line: Line3D | null = intersectPlanes(
      thisPlane,
      viewportPlane(other, referencePoint),
    );
    if (!line) continue;
    const clipped = clipLineToRect(line, rect.centre, right, up, [
      rect.halfWidthMm,
      rect.halfHeightMm,
    ]);
    if (!clipped) continue;
    segments.push({ sourcePlane: other, start: clipped[0], end: clipped[1] });
  }
  return segments;
}

/**
 * Verify that the three viewports really do share one anatomical point.
 * Used by the automated crosshair accuracy test and available at runtime as a
 * self-check: the maximum perpendicular distance from the reference point to
 * each displayed plane must be zero to within floating-point noise.
 */
export function crosshairConsistencyErrorMm(
  referencePoint: Vec3,
  displayedPlanes: Record<MPRPlane, Plane>,
): number {
  let worst = 0;
  for (const plane of Object.values(displayedPlanes)) {
    const d = Math.abs(dot(sub(referencePoint, plane.point), plane.normal));
    if (d > worst) worst = d;
  }
  return worst;
}

/**
 * Where the three planes meet. For the three cardinal MPR planes this must
 * return exactly the reference point; it is computed independently (by
 * intersecting the planes) so the tests can prove the synchronisation rather
 * than assume it.
 */
export function triplePlaneIntersection(
  planes: readonly [Plane, Plane, Plane],
): Vec3 | null {
  const line = intersectPlanes(planes[0], planes[1]);
  if (!line) return null;
  const n = planes[2].normal;
  const denom = dot(line.direction, n);
  if (Math.abs(denom) < 1e-12) return null;
  const t = dot(sub(planes[2].point, line.point), n) / denom;
  return add(line.point, scale(line.direction, t));
}
