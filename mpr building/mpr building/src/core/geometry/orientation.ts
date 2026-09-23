/**
 * Anatomical orientation labelling.
 *
 * Labels are DERIVED from real direction vectors in the DICOM patient (LPS)
 * coordinate system. Nothing here is hard-coded per plane, so oblique
 * acquisitions, head-first/feet-first and prone/supine positioning all produce
 * correct markers without special cases.
 */

import { dot, negate, normalize, type Vec3 } from '../math/vec';

export type AnatomicalLetter = 'R' | 'L' | 'A' | 'P' | 'S' | 'I';

const AXES: Array<{ positive: AnatomicalLetter; negative: AnatomicalLetter; axis: 0 | 1 | 2 }> = [
  // +x = Left, -x = Right
  { positive: 'L', negative: 'R', axis: 0 },
  // +y = Posterior, -y = Anterior
  { positive: 'P', negative: 'A', axis: 1 },
  // +z = Superior, -z = Inferior
  { positive: 'S', negative: 'I', axis: 2 },
];

/**
 * Convert a patient-space direction into an anatomical label, e.g. [0,0,1] ->
 * "S", or an oblique direction -> "SA" / "RPI". Components are emitted in
 * descending magnitude, which matches radiological convention.
 *
 * @param threshold Components below this fraction of unit length are omitted.
 */
export function directionToAnatomicalLabel(
  direction: Vec3,
  threshold = 0.15,
  maxLetters = 3,
): string {
  const v = normalize(direction);
  const parts = AXES.map(({ positive, negative, axis }) => ({
    letter: v[axis] >= 0 ? positive : negative,
    magnitude: Math.abs(v[axis]),
  }))
    .filter((p) => p.magnitude >= threshold)
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, maxLetters);

  if (parts.length === 0) return '';
  return parts.map((p) => p.letter).join('');
}

export interface ViewportOrientationLabels {
  top: string;
  bottom: string;
  left: string;
  right: string;
}

/**
 * Labels for the four edges of a viewport, given the camera basis.
 *
 * @param viewUp     World direction that points towards the TOP of the screen.
 * @param viewRight  World direction that points towards the RIGHT of the screen.
 */
export function viewportOrientationLabels(
  viewUp: Vec3,
  viewRight: Vec3,
): ViewportOrientationLabels {
  return {
    top: directionToAnatomicalLabel(viewUp),
    bottom: directionToAnatomicalLabel(negate(viewUp)),
    right: directionToAnatomicalLabel(viewRight),
    left: directionToAnatomicalLabel(negate(viewRight)),
  };
}

/**
 * Screen-right direction for a camera, derived from the view plane normal and
 * the up vector. Uses a right-handed camera convention where the normal points
 * FROM the scene TOWARDS the viewer.
 *
 *   right = normalize(cross(viewUp, viewPlaneNormal))
 *
 * so that right x up = normal (a right-handed, non-mirrored screen basis).
 *
 * Worked example — the radiological axial convention used by the axial
 * viewport (normal = [0,0,-1] i.e. feet-ward, up = [0,-1,0] i.e. anterior):
 *   right = cross([0,-1,0], [0,0,-1]) = [1,0,0] = patient LEFT.
 * Patient left therefore appears on the right of the screen, as it must. The
 * label is never assumed: it is computed from the camera the viewport is
 * actually using, so a flipped or oblique camera relabels itself.
 */
export function screenRightFromCamera(viewUp: Vec3, viewPlaneNormal: Vec3): Vec3 {
  const up = normalize(viewUp);
  const n = normalize(viewPlaneNormal);
  return normalize([
    up[1] * n[2] - up[2] * n[1],
    up[2] * n[0] - up[0] * n[2],
    up[0] * n[1] - up[1] * n[0],
  ]);
}

/**
 * Sanity check used by the automated geometry tests and by the runtime
 * guard: a viewport basis must be right-handed and orthogonal, otherwise the
 * displayed anatomy could be mirrored.
 */
export function isNonMirroredBasis(
  viewRight: Vec3,
  viewUp: Vec3,
  viewPlaneNormal: Vec3,
  tol = 1e-4,
): boolean {
  const r = normalize(viewRight);
  const u = normalize(viewUp);
  const n = normalize(viewPlaneNormal);
  const orthogonal =
    Math.abs(dot(r, u)) < tol &&
    Math.abs(dot(r, n)) < tol &&
    Math.abs(dot(u, n)) < tol;
  // right x up should equal +normal for a non-mirrored right-handed basis.
  const rxu: Vec3 = [
    r[1] * u[2] - r[2] * u[1],
    r[2] * u[0] - r[0] * u[2],
    r[0] * u[1] - r[1] * u[0],
  ];
  return orthogonal && dot(rxu, n) > 1 - tol;
}

/** Patient Position (0018,5100) decoded for the diagnostic panel. */
export function describePatientPosition(code?: string): string {
  if (!code) return 'Unknown';
  const map: Record<string, string> = {
    HFS: 'Head First–Supine',
    HFP: 'Head First–Prone',
    HFDR: 'Head First–Decubitus Right',
    HFDL: 'Head First–Decubitus Left',
    FFS: 'Feet First–Supine',
    FFP: 'Feet First–Prone',
    FFDR: 'Feet First–Decubitus Right',
    FFDL: 'Feet First–Decubitus Left',
  };
  return map[code.toUpperCase()] ?? code;
}
