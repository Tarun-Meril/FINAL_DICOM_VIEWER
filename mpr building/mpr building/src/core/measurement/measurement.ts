/**
 * World-space measurement primitives.
 *
 * Every measurement is stored and evaluated in patient-space millimetres.
 * Screen pixels are used only to pick a point; the moment a point is captured
 * it is converted to world coordinates and the pixel value is discarded. A
 * consequence is that a measurement keeps its length and its anatomical
 * position through zoom, pan, resize, layout change and plane change.
 */

import {
  angleDeg,
  cross,
  distance,
  dot,
  length,
  normalize,
  sub,
  type Vec3,
} from '../math/vec';
import type { Plane } from '../geometry/planeIntersection';
import { signedDistanceToPlane } from '../geometry/planeIntersection';

export type MeasurementKind = 'length' | 'angle' | 'rectangleRoi' | 'ellipseRoi' | 'probe';

export interface MeasurementBase {
  readonly id: string;
  readonly kind: MeasurementKind;
  /** Patient-space handle positions, mm. The source of truth. */
  readonly points: readonly Vec3[];
  /** Frame of Reference the points belong to; guards cross-study paste. */
  readonly frameOfReferenceUID?: string;
  /** Plane the measurement was drawn on — used to decide visibility. */
  readonly planeNormal: Vec3;
  readonly createdOnViewport: string;
  readonly label?: string;
  readonly createdAt: number;
}

export interface LengthMeasurement extends MeasurementBase {
  readonly kind: 'length';
}
export interface AngleMeasurement extends MeasurementBase {
  readonly kind: 'angle';
}
export interface RoiMeasurement extends MeasurementBase {
  readonly kind: 'rectangleRoi' | 'ellipseRoi';
}
export interface ProbeMeasurement extends MeasurementBase {
  readonly kind: 'probe';
}

export type Measurement =
  | LengthMeasurement
  | AngleMeasurement
  | RoiMeasurement
  | ProbeMeasurement;

/** Distance in millimetres between two patient-space points. */
export function measureLengthMm(a: Vec3, b: Vec3): number {
  return distance(a, b);
}

/** Angle at vertex `v` between rays to `a` and `b`, in degrees. */
export function measureAngleDeg(a: Vec3, v: Vec3, b: Vec3): number {
  return angleDeg(sub(a, v), sub(b, v));
}

/** Area in mm^2 of a planar polygon given in patient-space coordinates. */
export function measurePolygonAreaMm2(points: readonly Vec3[]): number {
  if (points.length < 3) return 0;
  // Newell's method: magnitude of the summed cross products / 2. Works for any
  // planar polygon in any orientation, so it is correct on oblique reformats.
  let sum: Vec3 = [0, 0, 0];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const c = cross(p, q);
    sum = [sum[0] + c[0], sum[1] + c[1], sum[2] + c[2]];
  }
  return length(sum) / 2;
}

/** Area of an axis-aligned-in-plane rectangle defined by two opposite corners. */
export function measureRectangleAreaMm2(
  corner0: Vec3,
  corner1: Vec3,
  planeU: Vec3,
  planeV: Vec3,
): number {
  const d = sub(corner1, corner0);
  return Math.abs(dot(d, normalize(planeU))) * Math.abs(dot(d, normalize(planeV)));
}

export function measureEllipseAreaMm2(
  corner0: Vec3,
  corner1: Vec3,
  planeU: Vec3,
  planeV: Vec3,
): number {
  const d = sub(corner1, corner0);
  const a = Math.abs(dot(d, normalize(planeU))) / 2;
  const b = Math.abs(dot(d, normalize(planeV))) / 2;
  return Math.PI * a * b;
}

export interface MeasurementVisibility {
  readonly visible: boolean;
  /** Perpendicular distance of the measurement from the displayed plane, mm. */
  readonly distanceMm: number;
}

/**
 * Decide whether a measurement drawn in one plane should be shown on the plane
 * currently displayed by a viewport.
 *
 * A measurement is drawn when every one of its handles lies within half the
 * displayed slab thickness of the plane. This is what keeps an axial length
 * from appearing to float over an unrelated coronal slice.
 */
export function measurementVisibility(
  measurement: Measurement,
  displayedPlane: Plane,
  slabThicknessMm: number,
): MeasurementVisibility {
  const half = Math.max(slabThicknessMm, 0.001) / 2;
  let maxAbs = 0;
  for (const p of measurement.points) {
    const d = Math.abs(signedDistanceToPlane(p, displayedPlane));
    if (d > maxAbs) maxAbs = d;
  }
  return { visible: maxAbs <= half, distanceMm: maxAbs };
}

/** Human-readable value for the annotation overlay. */
export function formatMeasurement(m: Measurement): string {
  switch (m.kind) {
    case 'length':
      return m.points.length >= 2
        ? `${measureLengthMm(m.points[0], m.points[1]).toFixed(1)} mm`
        : '';
    case 'angle':
      return m.points.length >= 3
        ? `${measureAngleDeg(m.points[0], m.points[1], m.points[2]).toFixed(1)}°`
        : '';
    case 'rectangleRoi':
    case 'ellipseRoi':
      return m.points.length >= 2 ? 'ROI' : '';
    case 'probe':
      return '';
    default:
      return '';
  }
}
