/**
 * 3D measurements in physical patient coordinates (§21).
 *
 * Every value is derived from world-space millimetres. Nothing here ever touches
 * screen pixels, so a measurement is independent of zoom, projection and viewport size.
 */
import { distance, angleAtVertexDeg, sub, type Vec3 } from '@3d/math/vec3';
import type { VolumeGeometry } from '@3d/dicom/geometry';

export type MeasurementKind = 'point' | 'distance' | 'angle' | 'polyline' | 'bounding-box' | 'segment-volume' | 'surface-area';

export interface MeasurementBase {
  readonly id: string;
  readonly kind: MeasurementKind;
  label: string;
  color: readonly [number, number, number];
  visible: boolean;
  readonly createdAt: number;
  /** World (LPS mm) control points. */
  readonly points: readonly Vec3[];
  /** True when the geometry it was taken on is known to be spatially valid. */
  readonly spatiallyValid: boolean;
  readonly note?: string;
}

export interface MeasurementValue {
  readonly primary: number;
  readonly unit: 'mm' | 'cm' | 'deg' | 'mm2' | 'cm2' | 'mm3' | 'mL' | 'HU' | '';
  readonly display: string;
  readonly components?: Readonly<Record<string, string>>;
}

export function measure(m: MeasurementBase, geometry?: VolumeGeometry, extra?: { volumeMm3?: number; areaMm2?: number; hu?: number }): MeasurementValue {
  switch (m.kind) {
    case 'point': {
      const p = m.points[0];
      // A probe stores its reading in the label when it is placed, so the value survives
      // serialisation without re-picking against a transfer function that may have moved.
      const stored = Number.parseFloat(m.label);
      const hu = extra?.hu ?? (Number.isFinite(stored) ? stored : NaN);
      return {
        primary: hu, unit: 'HU',
        display: Number.isFinite(hu) ? `${Math.round(hu)} HU` : '—',
        components: p ? { LPS: `${p[0].toFixed(1)}, ${p[1].toFixed(1)}, ${p[2].toFixed(1)} mm` } : undefined,
      };
    }
    case 'distance': {
      const d = m.points.length >= 2 ? distance(m.points[0], m.points[1]) : NaN;
      const v = m.points.length >= 2 ? sub(m.points[1], m.points[0]) : ([0, 0, 0] as Vec3);
      return {
        primary: d, unit: 'mm', display: formatLength(d),
        components: {
          'Δ Left–Right': `${Math.abs(v[0]).toFixed(2)} mm`,
          'Δ Ant–Post': `${Math.abs(v[1]).toFixed(2)} mm`,
          'Δ Sup–Inf': `${Math.abs(v[2]).toFixed(2)} mm`,
        },
      };
    }
    case 'angle': {
      const a = m.points.length >= 3 ? angleAtVertexDeg(m.points[1], m.points[0], m.points[2]) : NaN;
      return { primary: a, unit: 'deg', display: Number.isFinite(a) ? `${a.toFixed(1)}°` : '—' };
    }
    case 'polyline': {
      let total = 0;
      for (let i = 1; i < m.points.length; i++) total += distance(m.points[i - 1], m.points[i]);
      return {
        primary: total, unit: 'mm', display: formatLength(total),
        components: { Segments: String(Math.max(0, m.points.length - 1)) },
      };
    }
    case 'bounding-box': {
      if (m.points.length < 2) return { primary: NaN, unit: 'mm', display: '—' };
      const [a, b] = m.points;
      const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]), dz = Math.abs(b[2] - a[2]);
      return {
        primary: dx * dy * dz, unit: 'mm3',
        display: `${dx.toFixed(1)} × ${dy.toFixed(1)} × ${dz.toFixed(1)} mm`,
        components: {
          'Left–Right': `${dx.toFixed(1)} mm`, 'Ant–Post': `${dy.toFixed(1)} mm`,
          'Sup–Inf': `${dz.toFixed(1)} mm`, Volume: formatVolume(dx * dy * dz),
        },
      };
    }
    case 'segment-volume': {
      const v = extra?.volumeMm3 ?? NaN;
      const voxel = geometry ? geometry.spacing[0] * geometry.spacing[1] * geometry.spacing[2] : NaN;
      return {
        primary: v, unit: 'mL', display: formatVolume(v),
        components: Number.isFinite(voxel)
          ? { 'Voxel volume': `${voxel.toFixed(4)} mm³`, Voxels: Number.isFinite(v) ? String(Math.round(v / voxel)) : '—' }
          : undefined,
      };
    }
    case 'surface-area': {
      const a = extra?.areaMm2 ?? NaN;
      return {
        primary: a, unit: 'cm2',
        display: Number.isFinite(a) ? `${(a / 100).toFixed(2)} cm²` : '—',
        components: Number.isFinite(a) ? { 'mm²': a.toFixed(0) } : undefined,
      };
    }
  }
}

export function formatLength(mm: number): string {
  if (!Number.isFinite(mm)) return '—';
  return mm >= 100 ? `${(mm / 10).toFixed(2)} cm` : `${mm.toFixed(2)} mm`;
}

export function formatVolume(mm3: number): string {
  if (!Number.isFinite(mm3)) return '—';
  const ml = mm3 / 1000;
  return ml >= 1 ? `${ml.toFixed(2)} mL` : `${mm3.toFixed(1)} mm³`;
}

/** Physical dimensions of the whole volume (§35 reporting). */
export function volumePhysicalDimensions(g: VolumeGeometry): {
  mm: Vec3; display: string;
} {
  const mm: Vec3 = [
    g.dimensions[0] * g.spacing[0], g.dimensions[1] * g.spacing[1], g.dimensions[2] * g.spacing[2],
  ];
  return { mm, display: `${mm[0].toFixed(1)} × ${mm[1].toFixed(1)} × ${mm[2].toFixed(1)} mm` };
}

/**
 * Whether a measurement may be trusted on this volume. Distances along the slice axis
 * are unreliable if spacing had to be assumed rather than measured (§4).
 */
export function measurementValidity(g: VolumeGeometry): { valid: boolean; reason?: string } {
  if (g.spacingSource === 'assumed-unit') {
    return { valid: false, reason: 'Inter-slice spacing had to be assumed; measurements with a superior–inferior component are not reliable.' };
  }
  if (g.spacingSource === 'slice-thickness') {
    return { valid: false, reason: 'Inter-slice spacing was taken from Slice Thickness rather than measured from image positions; slice-axis distances may be inaccurate.' };
  }
  return { valid: true };
}
