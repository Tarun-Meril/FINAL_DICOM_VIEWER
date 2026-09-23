/**
 * Clipping planes and the volume-of-interest crop box (§14, §15).
 *
 * Clipping is a pure rendering operation: it hides part of the volume on the GPU and
 * changes no voxel. Crop/VOI uses the same mechanism, plus an optional mask-based
 * "invert" (remove the inside) which clipping planes alone cannot express.
 */
import type { Vec3 } from '@/math/vec3';
import { worldBounds } from './imageDataFactory';
import type { VolumeGeometry } from '@/dicom/geometry';

export type ClipAxisId = 'right' | 'left' | 'anterior' | 'posterior' | 'superior' | 'inferior';

export interface ClipPlaneState {
  readonly id: ClipAxisId;
  enabled: boolean;
  /** Position along the axis, normalised 0..1 across the volume's world bounds. */
  position: number;
  /** Slab thickness in mm; 0 means a single half-space cut. */
  thickness: number;
  /** Flip which side is kept. */
  invert: boolean;
}

export interface CropBoxState {
  enabled: boolean;
  /** Normalised 0..1 bounds along world X (R→L), Y (A→P) and Z (I→S). */
  min: [number, number, number];
  max: [number, number, number];
  /** Remove the inside of the box rather than the outside (mask-based). */
  invert: boolean;
  showOnlyRoi: boolean;
}

/**
 * Axis index and the OUTWARD world direction of the anatomical side each plane is named
 * after. A plane called "Left" cuts material away starting from the patient's left.
 *
 * vtk.js clips a point when `dot(planeOrigin - point, planeNormal) > 0`
 * (`isPointClipped` in vtkVolumeFS.glsl), i.e. it KEEPS the half-space the normal points
 * into. The emitted normal is therefore the negation of the direction below, and this is
 * pinned by a unit test because getting the sign wrong empties the viewport.
 */
const AXIS_INFO: Record<ClipAxisId, { axis: 0 | 1 | 2; outward: Vec3; label: string }> = {
  //  +x is patient Left, +y is patient Posterior, +z is patient Superior.
  left:      { axis: 0, outward: [1, 0, 0],  label: 'Left' },
  right:     { axis: 0, outward: [-1, 0, 0], label: 'Right' },
  posterior: { axis: 1, outward: [0, 1, 0],  label: 'Posterior (back)' },
  anterior:  { axis: 1, outward: [0, -1, 0], label: 'Anterior (front)' },
  superior:  { axis: 2, outward: [0, 0, 1],  label: 'Superior (top)' },
  inferior:  { axis: 2, outward: [0, 0, -1], label: 'Inferior (bottom)' },
};

export const CLIP_AXES: readonly ClipAxisId[] = ['right', 'left', 'anterior', 'posterior', 'superior', 'inferior'];

export function defaultClipState(): ClipPlaneState[] {
  return CLIP_AXES.map((id) => ({ id, enabled: false, position: id === 'left' || id === 'posterior' || id === 'superior' ? 1 : 0, thickness: 0, invert: false }));
}

export function defaultCropBox(): CropBoxState {
  return { enabled: false, min: [0, 0, 0], max: [1, 1, 1], invert: false, showOnlyRoi: false };
}

export function clipAxisLabel(id: ClipAxisId): string { return AXIS_INFO[id].label; }

export interface ResolvedPlane { origin: Vec3; normal: Vec3 }

/**
 * Turn the clip state into vtk clipping planes. The emitted normal points at the material
 * that is KEPT (see `AXIS_INFO`).
 */
export function resolveClipPlanes(
  state: readonly ClipPlaneState[], geometry: VolumeGeometry,
): ResolvedPlane[] {
  const b = worldBounds(geometry);
  const out: ResolvedPlane[] = [];
  for (const p of state) {
    if (!p.enabled) continue;
    const { axis, outward } = AXIS_INFO[p.id];
    const lo = b[axis * 2], hi = b[axis * 2 + 1];
    const pos = lo + (hi - lo) * Math.min(1, Math.max(0, p.position));
    // Keep the side away from the named anatomical direction; `invert` swaps it.
    const keep: Vec3 = p.invert ? outward : [-outward[0], -outward[1], -outward[2]];
    const o: [number, number, number] = [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2];
    o[axis] = pos;
    out.push({ origin: o as Vec3, normal: keep });
    if (p.thickness > 0) {
      // Slab: a second plane `thickness` mm further along the kept direction, facing back,
      // so only a slab of that thickness survives.
      const o2: [number, number, number] = [...o];
      o2[axis] = pos + keep[axis] * p.thickness;
      out.push({ origin: o2 as Vec3, normal: [-keep[0], -keep[1], -keep[2]] });
    }
  }
  return out;
}

/**
 * Crop box expressed as six clipping planes — the "show only ROI" path.
 *
 * `enabled` alone just displays the box outline so it can be positioned; the volume is
 * actually cropped once `showOnlyRoi` is set. `invert` (remove the inside) cannot be
 * expressed with half-spaces and is applied through the visibility mask instead.
 */
export function resolveCropPlanes(crop: CropBoxState, geometry: VolumeGeometry): ResolvedPlane[] {
  if (!crop.enabled || !crop.showOnlyRoi || crop.invert) return [];
  const b = worldBounds(geometry);
  const out: ResolvedPlane[] = [];
  for (let axis = 0; axis < 3; axis++) {
    const lo = b[axis * 2], hi = b[axis * 2 + 1];
    const minW = lo + (hi - lo) * crop.min[axis];
    const maxW = lo + (hi - lo) * crop.max[axis];
    const centre: [number, number, number] = [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2];
    const oMin: [number, number, number] = [...centre]; oMin[axis] = minW;
    const oMax: [number, number, number] = [...centre]; oMax[axis] = maxW;
    const towardsPlus: Vec3 = axis === 0 ? [1, 0, 0] : axis === 1 ? [0, 1, 0] : [0, 0, 1];
    const towardsMinus: Vec3 = [-towardsPlus[0], -towardsPlus[1], -towardsPlus[2]];
    // Keep the inside of the box: at the lower bound keep +axis, at the upper keep −axis.
    out.push({ origin: oMin as Vec3, normal: towardsPlus });
    out.push({ origin: oMax as Vec3, normal: towardsMinus });
  }
  return out;
}

/** Crop box in world millimetres, for the mask-based invert path and for display. */
export function cropBoxWorld(crop: CropBoxState, geometry: VolumeGeometry): { min: Vec3; max: Vec3 } {
  const b = worldBounds(geometry);
  const f = (axis: number, t: number) => b[axis * 2] + (b[axis * 2 + 1] - b[axis * 2]) * t;
  return {
    min: [f(0, crop.min[0]), f(1, crop.min[1]), f(2, crop.min[2])],
    max: [f(0, crop.max[0]), f(1, crop.max[1]), f(2, crop.max[2])],
  };
}

export function cropBoxDimensionsMm(crop: CropBoxState, geometry: VolumeGeometry): Vec3 {
  const { min, max } = cropBoxWorld(crop, geometry);
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
}
