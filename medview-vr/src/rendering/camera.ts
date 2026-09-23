/**
 * Camera presets and projection control (§16-§18).
 *
 * All camera vectors are expressed in DICOM patient (LPS) world coordinates:
 *   +x = patient Left, +y = patient Posterior, +z = patient Superior.
 */
import type { Vec3 } from '@/math/vec3';
import { normalize, cross, add, scale } from '@/math/vec3';

export type CameraPresetId =
  | 'anterior' | 'posterior' | 'left' | 'right' | 'superior' | 'inferior'
  | 'ant-left-45' | 'ant-right-45' | 'post-left-45' | 'post-right-45';

export interface CameraPreset {
  readonly id: CameraPresetId;
  readonly label: string;
  /** Direction from the focal point towards the camera, in LPS. */
  readonly offsetDirection: Vec3;
  readonly viewUp: Vec3;
  /** What the viewer sees on the right-hand side of the screen. Oblique views carry a
   *  two-letter code because their screen-right lies between two anatomical axes. */
  readonly screenRight: string;
  /** True for the six cardinal views, whose screen-right is a single anatomical axis. */
  readonly cardinal: boolean;
  readonly description: string;
}

const S: Vec3 = [0, 0, 1];   // superior
const A: Vec3 = [0, -1, 0];  // anterior

export const CAMERA_PRESETS: readonly CameraPreset[] = [
  { id: 'anterior',  label: 'Anterior (A)',  offsetDirection: [0, -1, 0], viewUp: S, screenRight: 'L', cardinal: true,
    description: 'Viewed from the front. The patient\'s left is on the right of the screen.' },
  { id: 'posterior', label: 'Posterior (P)', offsetDirection: [0, 1, 0],  viewUp: S, screenRight: 'R', cardinal: true,
    description: 'Viewed from behind. The patient\'s right is on the right of the screen.' },
  { id: 'left',      label: 'Left (L)',      offsetDirection: [1, 0, 0],  viewUp: S, screenRight: 'P', cardinal: true,
    description: 'Viewed from the patient\'s left. Anterior is on the left of the screen.' },
  { id: 'right',     label: 'Right (R)',     offsetDirection: [-1, 0, 0], viewUp: S, screenRight: 'A', cardinal: true,
    description: 'Viewed from the patient\'s right. Anterior is on the right of the screen.' },
  { id: 'superior',  label: 'Superior (S)',  offsetDirection: [0, 0, 1],  viewUp: A, screenRight: 'R', cardinal: true,
    description: 'Viewed from above, looking down. Anterior is at the top of the screen.' },
  { id: 'inferior',  label: 'Inferior (I)',  offsetDirection: [0, 0, -1], viewUp: A, screenRight: 'L', cardinal: true,
    description: 'Viewed from below, looking up. Anterior is at the top of the screen.' },
  { id: 'ant-left-45',   label: 'Ant-Left 45°',   offsetDirection: normalize([1, -1, 0]),  viewUp: S, screenRight: 'LP', cardinal: false,
    description: '45° oblique between anterior and the patient\'s left.' },
  { id: 'ant-right-45',  label: 'Ant-Right 45°',  offsetDirection: normalize([-1, -1, 0]), viewUp: S, screenRight: 'LA', cardinal: false,
    description: '45° oblique between anterior and the patient\'s right.' },
  { id: 'post-left-45',  label: 'Post-Left 45°',  offsetDirection: normalize([1, 1, 0]),   viewUp: S, screenRight: 'PR', cardinal: false,
    description: '45° oblique between posterior and the patient\'s left.' },
  { id: 'post-right-45', label: 'Post-Right 45°', offsetDirection: normalize([-1, 1, 0]),  viewUp: S, screenRight: 'AR', cardinal: false,
    description: '45° oblique between posterior and the patient\'s right.' },
];

export function cameraPreset(id: CameraPresetId): CameraPreset {
  const p = CAMERA_PRESETS.find((c) => c.id === id);
  if (!p) throw new Error(`Unknown camera preset "${id}"`);
  return p;
}

export interface CameraState {
  readonly position: Vec3;
  readonly focalPoint: Vec3;
  readonly viewUp: Vec3;
  readonly parallelProjection: boolean;
  readonly parallelScale: number;
  readonly viewAngle: number;
}

/** Compute a camera placement for a preset given the volume centre and radius. */
export function placeCamera(
  preset: CameraPreset, centre: Vec3, radiusMm: number, parallel: boolean, viewAngleDeg = 30,
): CameraState {
  const distance = parallel
    ? radiusMm * 3
    : radiusMm / Math.tan((viewAngleDeg * Math.PI) / 360);
  return {
    position: add(centre, scale(normalize(preset.offsetDirection), distance)),
    focalPoint: centre,
    viewUp: normalize(preset.viewUp),
    parallelProjection: parallel,
    parallelScale: radiusMm,
    viewAngle: viewAngleDeg,
  };
}

/** Screen-space anatomical direction labels for the current camera (§9, §24). */
export function screenDirections(state: CameraState): {
  right: Vec3; left: Vec3; up: Vec3; down: Vec3; towardsViewer: Vec3;
} {
  const forward = normalize([
    state.focalPoint[0] - state.position[0],
    state.focalPoint[1] - state.position[1],
    state.focalPoint[2] - state.position[2],
  ]);
  const up = normalize(state.viewUp);
  const right = normalize(cross(forward, up));
  // Re-orthogonalise up in case viewUp was not perpendicular to the view direction.
  const trueUp = normalize(cross(right, forward));
  return {
    right,
    left: scale(right, -1),
    up: trueUp,
    down: scale(trueUp, -1),
    towardsViewer: scale(forward, -1),
  };
}
