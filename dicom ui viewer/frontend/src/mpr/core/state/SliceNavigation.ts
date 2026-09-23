/**
 * SliceNavigationManager
 * ----------------------
 * Slice indexing for a REFORMATTED plane.
 *
 * "Slice 125 / 450" means something different in a reformat than in the source
 * stack: the axial view of an axially-acquired volume indexes real acquired
 * slices, while the coronal view indexes samples of a resampled plane. Both
 * are computed here from the true patient-space extent of the volume along the
 * plane normal, divided by the real sampling pitch of that reformat. No value
 * is fabricated and none is derived from a screen dimension.
 */

import { dot, type Vec3 } from '../math/vec';
import { PLANE_CAMERAS, type MPRPlane } from './planes';
import type { SpatialTransform } from '../geometry/SpatialTransform';
import { reformatPitchMm } from '../crosshair/CrosshairManager';

export interface SliceInfo {
  readonly plane: MPRPlane;
  /** 1-based index shown to the user. */
  readonly index: number;
  readonly total: number;
  /** Signed patient-space position along the plane normal, mm. */
  readonly positionMm: number;
  /** Sampling pitch of this reformat, mm. */
  readonly pitchMm: number;
  /** Source slice thickness where the plane matches the acquisition, else the slab. */
  readonly thicknessMm: number;
  readonly minPositionMm: number;
  readonly maxPositionMm: number;
}

function extentAlongNormal(
  transform: SpatialTransform,
  normal: Vec3,
): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const c of transform.corners()) {
    const d = dot(c, normal);
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}

export function sliceInfoForPlane(
  plane: MPRPlane,
  referencePoint: Vec3,
  transform: SpatialTransform,
  slabThicknessMm: number,
): SliceInfo {
  const normal = PLANE_CAMERAS[plane].viewPlaneNormal;
  const pitchMm = reformatPitchMm(
    plane,
    {
      i: transform.rowDirection,
      j: transform.columnDirection,
      k: transform.sliceNormal,
    },
    transform.spacing,
  );
  const { min, max } = extentAlongNormal(transform, normal);
  const span = max - min;
  const total = Math.max(1, Math.round(span / pitchMm) + 1);
  const positionMm = dot(referencePoint, normal);
  const index = Math.min(
    total,
    Math.max(1, Math.round((positionMm - min) / pitchMm) + 1),
  );

  return {
    plane,
    index,
    total,
    positionMm,
    pitchMm,
    thicknessMm: slabThicknessMm > 0 ? slabThicknessMm : pitchMm,
    minPositionMm: min,
    maxPositionMm: max,
  };
}

/** Clamp a reference point so navigation can never leave the volume. */
export function clampReferenceToVolume(
  referencePoint: Vec3,
  transform: SpatialTransform,
): Vec3 {
  return transform.clampWorld(referencePoint);
}

export type NavigationCommand =
  | { type: 'step'; steps: number }
  | { type: 'page'; pages: number }
  | { type: 'first' }
  | { type: 'last' }
  | { type: 'centre' };

/** Slices moved by one Page Up / Page Down. */
export const PAGE_STEP_SLICES = 10;

export function resolveNavigation(
  command: NavigationCommand,
  info: SliceInfo,
): number {
  switch (command.type) {
    case 'step':
      return command.steps;
    case 'page':
      return command.pages * PAGE_STEP_SLICES;
    case 'first':
      return 1 - info.index;
    case 'last':
      return info.total - info.index;
    case 'centre':
      return Math.round(info.total / 2) - info.index;
    default:
      return 0;
  }
}
