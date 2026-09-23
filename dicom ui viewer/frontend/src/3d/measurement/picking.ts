/**
 * First-hit picking on a volume rendering.
 *
 * Measurements must be taken in physical patient coordinates (§21), so a screen click
 * is converted into a world-space point by casting the same ray the renderer casts and
 * finding where opacity first accumulates past a threshold. This is done on the CPU
 * against the source scalars, which makes it exact and independent of GPU readback.
 */
import { normalize, cross, add, scale, dot, sub, worldToIndex, type Vec3 } from '@3d/math/vec3';
import type { CameraState } from '@3d/rendering/camera';
import type { VolumeGeometry } from '@3d/dicom/geometry';
import type { TransferFunction } from '@3d/rendering/transferFunction';
import { evaluateOpacity } from '@3d/rendering/transferFunction';

export interface Ray { readonly origin: Vec3; readonly direction: Vec3 }

export function rayThroughPixel(
  camera: CameraState, px: number, py: number, width: number, height: number,
): Ray {
  const forward = normalize(sub(camera.focalPoint, camera.position));
  const right = normalize(cross(forward, camera.viewUp));
  const up = normalize(cross(right, forward));
  const ndcX = (2 * px) / width - 1;
  const ndcY = 1 - (2 * py) / height;
  const aspect = width / height;

  if (camera.parallelProjection) {
    const halfH = camera.parallelScale;
    const origin = add(add(camera.focalPoint, scale(right, ndcX * halfH * aspect)), scale(up, ndcY * halfH));
    // Step back so the ray starts outside the volume.
    return { origin: add(origin, scale(forward, -1e4)), direction: forward };
  }
  const tanHalf = Math.tan((camera.viewAngle * Math.PI) / 360);
  const dir = normalize(add(add(forward, scale(right, ndcX * tanHalf * aspect)), scale(up, ndcY * tanHalf)));
  return { origin: camera.position, direction: dir };
}

/** Intersect a ray with the volume in index space; returns [tEnter, tExit] or null. */
function intersectVolume(ray: Ray, g: VolumeGeometry): [number, number] | null {
  const o = worldToIndex(ray.origin, g.origin, g.spacing, g.iAxis, g.jAxis, g.kAxis);
  const d: Vec3 = [
    dot(ray.direction, g.iAxis) / g.spacing[0],
    dot(ray.direction, g.jAxis) / g.spacing[1],
    dot(ray.direction, g.kAxis) / g.spacing[2],
  ];
  let tMin = -Infinity, tMax = Infinity;
  for (let a = 0; a < 3; a++) {
    const lo = -0.5, hi = g.dimensions[a] - 0.5;
    if (Math.abs(d[a]) < 1e-12) {
      if (o[a] < lo || o[a] > hi) return null;
      continue;
    }
    let t1 = (lo - o[a]) / d[a];
    let t2 = (hi - o[a]) / d[a];
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return [Math.max(tMin, 0), tMax];
}

export interface PickResult {
  readonly world: Vec3;
  readonly index: Vec3;
  readonly hu: number;
  readonly accumulatedOpacity: number;
  readonly distanceMm: number;
}

export interface PickOptions {
  /** Accumulated opacity at which the surface is considered hit. */
  readonly opacityThreshold?: number;
  /** Sampling step in mm along the ray. */
  readonly stepMm?: number;
  /** Skip voxels removed by sculpting/cropping. */
  readonly visibility?: Uint8Array | null;
}

export function pickFirstHit(
  ray: Ray, scalars: Int16Array, g: VolumeGeometry, tf: TransferFunction, opts: PickOptions = {},
): PickResult | null {
  const span = intersectVolume(ray, g);
  if (!span) return null;
  const step = opts.stepMm ?? Math.min(...g.spacing) * 0.5;
  const threshold = opts.opacityThreshold ?? 0.35;
  const [nx, ny, nz] = g.dimensions;
  const sxy = nx * ny;
  const unit = tf.scalarOpacityUnitDistance > 0 ? tf.scalarOpacityUnitDistance : 1;

  let accumulated = 0;
  const maxT = span[1];
  for (let t = span[0]; t <= maxT; t += step) {
    const w = add(ray.origin, scale(ray.direction, t));
    const idx = worldToIndex(w, g.origin, g.spacing, g.iAxis, g.jAxis, g.kAxis);
    const i = Math.round(idx[0]), j = Math.round(idx[1]), k = Math.round(idx[2]);
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
    const p = k * sxy + j * nx + i;
    if (opts.visibility && !opts.visibility[p]) continue;
    const hu = scalars[p];
    const alpha = evaluateOpacity(tf, hu);
    if (alpha <= 0) continue;
    // Opacity correction for the actual step length (the same rule the shader uses).
    const corrected = 1 - Math.pow(1 - Math.min(0.999999, alpha), step / unit);
    accumulated += (1 - accumulated) * corrected;
    if (accumulated >= threshold) {
      return { world: w, index: [i, j, k], hu, accumulatedOpacity: accumulated, distanceMm: t };
    }
  }
  return null;
}

/** Highest-attenuation sample along the ray — the pick rule that suits MIP. */
export function pickMaximum(
  ray: Ray, scalars: Int16Array, g: VolumeGeometry, opts: PickOptions = {},
): PickResult | null {
  const span = intersectVolume(ray, g);
  if (!span) return null;
  const step = opts.stepMm ?? Math.min(...g.spacing) * 0.5;
  const [nx, ny, nz] = g.dimensions;
  const sxy = nx * ny;
  let best: PickResult | null = null;
  for (let t = span[0]; t <= span[1]; t += step) {
    const w = add(ray.origin, scale(ray.direction, t));
    const idx = worldToIndex(w, g.origin, g.spacing, g.iAxis, g.jAxis, g.kAxis);
    const i = Math.round(idx[0]), j = Math.round(idx[1]), k = Math.round(idx[2]);
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
    const p = k * sxy + j * nx + i;
    if (opts.visibility && !opts.visibility[p]) continue;
    const hu = scalars[p];
    if (!best || hu > best.hu) best = { world: w, index: [i, j, k], hu, accumulatedOpacity: 1, distanceMm: t };
  }
  return best;
}

/** Project a world point to viewport pixels (for measurement labels and handles). */
export function worldToScreen(
  camera: CameraState, world: Vec3, width: number, height: number,
): { x: number; y: number; depth: number; behind: boolean } {
  const forward = normalize(sub(camera.focalPoint, camera.position));
  const right = normalize(cross(forward, camera.viewUp));
  const up = normalize(cross(right, forward));
  const d = sub(world, camera.position);
  const z = dot(d, forward);
  const x = dot(d, right);
  const y = dot(d, up);
  const aspect = width / height;

  if (camera.parallelProjection) {
    const halfH = camera.parallelScale;
    const df = sub(world, camera.focalPoint);
    const ndcX = dot(df, right) / (halfH * aspect);
    const ndcY = dot(df, up) / halfH;
    return { x: ((ndcX + 1) / 2) * width, y: ((1 - ndcY) / 2) * height, depth: z, behind: false };
  }
  const tanHalf = Math.tan((camera.viewAngle * Math.PI) / 360);
  if (z <= 1e-6) return { x: NaN, y: NaN, depth: z, behind: true };
  const ndcX = x / (z * tanHalf * aspect);
  const ndcY = y / (z * tanHalf);
  return { x: ((ndcX + 1) / 2) * width, y: ((1 - ndcY) / 2) * height, depth: z, behind: false };
}
