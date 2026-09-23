/**
 * Canonical MPR plane definitions, in DICOM patient (LPS) coordinates.
 *
 * These are the CAMERA definitions for the three reformatted views. They are
 * expressed in patient space, not in volume index space, which is what makes
 * the reformats correct for oblique and gantry-tilted acquisitions: the
 * cameras always describe true patient anatomy, and the renderer resamples the
 * volume to satisfy them.
 *
 * viewPlaneNormal points FROM the anatomy TOWARDS the viewer.
 * screenRight = cross(viewUp, viewPlaneNormal), so right x up = normal and the
 * displayed anatomy can never be mirrored.
 */

import type { Vec3 } from '../math/vec';
import { screenRightFromCamera } from '../geometry/orientation';

export type MPRPlane = 'axial' | 'coronal' | 'sagittal';
export const MPR_PLANES: readonly MPRPlane[] = ['axial', 'coronal', 'sagittal'];

export interface PlaneCamera {
  readonly viewPlaneNormal: Vec3;
  readonly viewUp: Vec3;
}

/**
 * Radiological convention throughout:
 *   axial    — viewed from the feet: patient Left on screen right, Anterior up
 *   coronal  — viewed from the front: patient Left on screen right, Superior up
 *   sagittal — viewed from the patient's left: Anterior on screen left, Superior up
 */
export const PLANE_CAMERAS: Record<MPRPlane, PlaneCamera> = {
  axial: { viewPlaneNormal: [0, 0, -1], viewUp: [0, -1, 0] },
  coronal: { viewPlaneNormal: [0, -1, 0], viewUp: [0, 0, 1] },
  sagittal: { viewPlaneNormal: [1, 0, 0], viewUp: [0, 0, 1] },
};

export function planeScreenRight(plane: MPRPlane): Vec3 {
  const c = PLANE_CAMERAS[plane];
  return screenRightFromCamera(c.viewUp, c.viewPlaneNormal);
}

export const PLANE_LABELS: Record<MPRPlane, string> = {
  axial: 'AXIAL',
  coronal: 'CORONAL',
  sagittal: 'SAGITTAL',
};

/** The other two planes — used when drawing reference lines. */
export function otherPlanes(plane: MPRPlane): MPRPlane[] {
  return MPR_PLANES.filter((p) => p !== plane);
}
