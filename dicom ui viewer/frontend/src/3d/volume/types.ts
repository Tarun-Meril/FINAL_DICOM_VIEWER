import type { VolumeGeometry } from '@3d/dicom/geometry';
import type { DiagnosticIssue } from '@3d/core/errors';

export interface HistogramData {
  /** Bin i covers [min + i*binWidth, min + (i+1)*binWidth). */
  readonly counts: Uint32Array;
  readonly min: number;
  readonly binWidth: number;
  readonly total: number;
}

export interface VolumeStatistics {
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly stdDev: number;
  readonly percentiles: Readonly<Record<'p001' | 'p01' | 'p1' | 'p5' | 'p25' | 'p50' | 'p75' | 'p95' | 'p99' | 'p999', number>>;
  readonly histogram: HistogramData;
  /** Fraction of voxels above +150 HU — a rough "how much dense material" indicator. */
  readonly denseFraction: number;
  /** Fraction of voxels below −500 HU (air / lung). */
  readonly airFraction: number;
}

export interface AppliedTransform {
  readonly kind: 'slice-resample' | 'shear-correction' | 'isotropic-resample' | 'downsample';
  readonly description: string;
  readonly parameters: Readonly<Record<string, number | string | readonly number[]>>;
}

/** Immutable record of where the volume came from and what was done to it (§28). */
export interface VolumeProvenance {
  readonly studyInstanceUID: string;
  readonly seriesInstanceUID: string;
  readonly frameOfReferenceUID?: string;
  readonly modality: string;
  readonly seriesDescription?: string;
  readonly sourceInstanceCount: number;
  readonly sourceSopInstanceUIDs: readonly string[];
  readonly rescaleSlope: number;
  readonly rescaleIntercept: number;
  readonly transferSyntaxUID: string;
  readonly reconstructionStrategy: string;
  readonly transforms: readonly AppliedTransform[];
  readonly createdAt: number;
}

/** SOURCE data. Never mutated after construction — every tool works on derived masks. */
export interface VolumeData {
  readonly id: string;
  /** Hounsfield Units for CT; stored values after the modality LUT for other modalities. */
  readonly scalars: Int16Array;
  readonly geometry: VolumeGeometry;
  readonly statistics: VolumeStatistics;
  readonly provenance: VolumeProvenance;
  /** True when the values are true Hounsfield Units (CT with a valid rescale). */
  readonly isHounsfield: boolean;
  readonly issues: readonly DiagnosticIssue[];
}

export function voxelCount(v: Pick<VolumeData, 'geometry'>): number {
  const d = v.geometry.dimensions;
  return d[0] * d[1] * d[2];
}

export function volumeByteLength(v: Pick<VolumeData, 'geometry'>): number {
  return voxelCount(v) * 2;
}
