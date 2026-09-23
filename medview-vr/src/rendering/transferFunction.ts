/**
 * Transfer-function model (§8).
 *
 * The model is pure data — serialisable, diff-able and independent of vtk.js — so the
 * presentation state (§29) can round-trip it and tests can assert on it without a GPU.
 */

export type Interpolation = 'linear' | 'smooth';

export interface OpacityPoint {
  /** Scalar position, in Hounsfield Units for CT. */
  readonly hu: number;
  /** 0..1 */
  readonly opacity: number;
  /** vtk piecewise midpoint (0..1) and sharpness (0..1); only used for 'smooth'. */
  readonly midpoint?: number;
  readonly sharpness?: number;
}

export interface ColorPoint {
  readonly hu: number;
  /** sRGB components 0..1 */
  readonly color: readonly [number, number, number];
}

export interface GradientOpacityConfig {
  readonly enabled: boolean;
  /** Gradient magnitudes below `min` get `minOpacity`; above `max` get `maxOpacity`. */
  readonly min: number;
  readonly max: number;
  readonly minOpacity: number;
  readonly maxOpacity: number;
}

export interface ShadingConfig {
  readonly enabled: boolean;
  readonly ambient: number;
  readonly diffuse: number;
  readonly specular: number;
  readonly specularPower: number;
}

export type BlendMode = 'composite' | 'mip' | 'minip' | 'average' | 'additive';

export interface TransferFunction {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly opacity: readonly OpacityPoint[];
  readonly color: readonly ColorPoint[];
  readonly gradientOpacity: GradientOpacityConfig;
  readonly shading: ShadingConfig;
  readonly interpolation: Interpolation;
  readonly blendMode: BlendMode;
  /** Distance in mm over which the opacity function is defined. Keeps the rendered
   *  density independent of the ray sample distance. */
  readonly scalarOpacityUnitDistance: number;
  /** Linear vs nearest sampling of the volume texture. */
  readonly interpolationType: 'linear' | 'nearest';
  /** Marks presets shipped with the application (they cannot be deleted, only copied). */
  readonly builtIn: boolean;
}

export const TRANSFER_FUNCTION_SCHEMA_VERSION = 1;

export function cloneTransferFunction(tf: TransferFunction, overrides: Partial<TransferFunction> = {}): TransferFunction {
  return {
    ...tf,
    opacity: tf.opacity.map((p) => ({ ...p })),
    color: tf.color.map((p) => ({ ...p, color: [...p.color] as [number, number, number] })),
    gradientOpacity: { ...tf.gradientOpacity },
    shading: { ...tf.shading },
    ...overrides,
  };
}

/** Sort and de-duplicate control points; the editor may hand us anything. */
export function normalizeTransferFunction(tf: TransferFunction): TransferFunction {
  const opacity = [...tf.opacity].sort((a, b) => a.hu - b.hu)
    .filter((p, i, arr) => i === 0 || Math.abs(p.hu - arr[i - 1].hu) > 1e-9);
  const color = [...tf.color].sort((a, b) => a.hu - b.hu)
    .filter((p, i, arr) => i === 0 || Math.abs(p.hu - arr[i - 1].hu) > 1e-9);
  return { ...tf, opacity, color };
}

/** Evaluate the opacity ramp at a scalar value (used by tests and the histogram overlay). */
export function evaluateOpacity(tf: TransferFunction, hu: number): number {
  const pts = tf.opacity;
  if (pts.length === 0) return 0;
  if (hu <= pts[0].hu) return pts[0].opacity;
  if (hu >= pts[pts.length - 1].hu) return pts[pts.length - 1].opacity;
  for (let i = 1; i < pts.length; i++) {
    if (hu <= pts[i].hu) {
      const a = pts[i - 1], b = pts[i];
      const t = (hu - a.hu) / (b.hu - a.hu);
      if (tf.interpolation === 'smooth') {
        const s = t * t * (3 - 2 * t); // smoothstep
        return a.opacity + (b.opacity - a.opacity) * s;
      }
      return a.opacity + (b.opacity - a.opacity) * t;
    }
  }
  return pts[pts.length - 1].opacity;
}

export function evaluateColor(tf: TransferFunction, hu: number): [number, number, number] {
  const pts = tf.color;
  if (pts.length === 0) return [1, 1, 1];
  if (hu <= pts[0].hu) return [...pts[0].color] as [number, number, number];
  if (hu >= pts[pts.length - 1].hu) return [...pts[pts.length - 1].color] as [number, number, number];
  for (let i = 1; i < pts.length; i++) {
    if (hu <= pts[i].hu) {
      const a = pts[i - 1], b = pts[i];
      const t = (hu - a.hu) / (b.hu - a.hu);
      return [
        a.color[0] + (b.color[0] - a.color[0]) * t,
        a.color[1] + (b.color[1] - a.color[1]) * t,
        a.color[2] + (b.color[2] - a.color[2]) * t,
      ];
    }
  }
  return [...pts[pts.length - 1].color] as [number, number, number];
}

/** Scalar range actually touched by the opacity function (for camera/LOD heuristics). */
export function effectiveRange(tf: TransferFunction): [number, number] {
  const visible = tf.opacity.filter((p) => p.opacity > 0.001);
  if (visible.length === 0) return [0, 0];
  return [visible[0].hu, visible[visible.length - 1].hu];
}

/** Shift the whole opacity ramp — the 3D equivalent of a window/level drag. */
export function shiftOpacity(tf: TransferFunction, deltaHU: number): TransferFunction {
  return { ...tf, opacity: tf.opacity.map((p) => ({ ...p, hu: p.hu + deltaHU })) };
}

/** Widen or narrow the ramp about its centre. */
export function scaleOpacityWidth(tf: TransferFunction, factor: number): TransferFunction {
  if (tf.opacity.length < 2) return tf;
  const lo = tf.opacity[0].hu, hi = tf.opacity[tf.opacity.length - 1].hu;
  const c = (lo + hi) / 2;
  return { ...tf, opacity: tf.opacity.map((p) => ({ ...p, hu: c + (p.hu - c) * factor })) };
}
