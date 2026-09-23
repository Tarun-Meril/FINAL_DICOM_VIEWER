/**
 * DICOM spatial geometry (§4) — the safety-critical core of the ingestion pipeline.
 *
 * Rules enforced here:
 *  - Slices are NEVER ordered by filename or InstanceNumber. Ordering is always the
 *    projection of ImagePositionPatient onto the slice normal.
 *  - SliceThickness is NEVER used as inter-slice spacing; spacing is measured from
 *    the physical positions and only falls back to tags when a single slice exists.
 *  - The k axis of the constructed volume is cross(rowCosines, columnCosines), so the
 *    basis (row, column, normal) is right-handed by construction and the volume can
 *    never be silently mirrored.
 */
import {
  cross, dot, normalize, sub, length, angleDeg, det3, approxEqual,
  type Vec3,
} from '@/math/vec3';
import { issue, ErrorCode, type DiagnosticIssue } from '@/core/errors';
import type { DicomInstanceMeta } from './types';

export interface SliceRef {
  readonly meta: DicomInstanceMeta;
  readonly frameIndex: number;
  /** Projection of ImagePositionPatient onto the slice normal, in mm. */
  readonly coordinate: number;
  readonly position: Vec3;
}

export type SpacingSource = 'measured' | 'spacing-between-slices' | 'slice-thickness' | 'assumed-unit';

export interface VolumeGeometry {
  /** World position (LPS mm) of the centre of voxel (0,0,0). */
  readonly origin: Vec3;
  /** [i, j, k] spacing in mm. i runs along image columns, j along rows, k along the normal. */
  readonly spacing: Vec3;
  /** World direction of increasing i (DICOM row cosines). */
  readonly iAxis: Vec3;
  /** World direction of increasing j (DICOM column cosines). */
  readonly jAxis: Vec3;
  /** World direction of increasing k (slice normal = cross(iAxis, jAxis)). */
  readonly kAxis: Vec3;
  readonly dimensions: readonly [number, number, number];
  /** Physical extent in mm (dimensions * spacing). */
  readonly physicalSize: Vec3;
  readonly frameOfReferenceUID?: string;
  readonly patientPosition?: string;
  readonly spacingSource: SpacingSource;
  readonly handedness: 1 | -1;
}

export interface GeometryAnalysis {
  readonly slices: readonly SliceRef[];
  readonly geometry: VolumeGeometry | null;
  readonly issues: readonly DiagnosticIssue[];
  readonly stats: {
    readonly spacingMin: number;
    readonly spacingMax: number;
    readonly spacingMedian: number;
    readonly spacingStdDev: number;
    /** Largest |spacing_i - median| / median. */
    readonly spacingRelativeDeviation: number;
    readonly duplicatePositions: number;
    readonly suspectedMissingSlices: number;
    /** Angle between the measured stack direction and the slice normal, degrees. */
    readonly stackShearDeg: number;
    readonly reversedRelativeToInstanceNumber: boolean;
  };
  /** Reconstruction strategy that the volume builder must apply. */
  readonly strategy: 'regular' | 'resample-irregular' | 'shear-correct' | 'reject';
}

const ORIENTATION_EPS = 1e-3;        // cosine tolerance for "same orientation"
const DUPLICATE_EPS_MM = 1e-3;
const SPACING_TOLERANCE = 0.01;      // 1 % relative deviation still counts as regular
const SHEAR_TOLERANCE_DEG = 0.1;

export function rowCosines(iop: readonly number[]): Vec3 { return [iop[0], iop[1], iop[2]]; }
export function columnCosines(iop: readonly number[]): Vec3 { return [iop[3], iop[4], iop[5]]; }

/** sliceNormal = normalize(cross(rowDirection, columnDirection)). */
export function sliceNormal(iop: readonly number[]): Vec3 {
  return normalize(cross(rowCosines(iop), columnCosines(iop)));
}

export function sliceCoordinate(ipp: Vec3, normal: Vec3): number {
  return dot(ipp, normal);
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Analyse the spatial geometry of a candidate set of instances and, when it is safe,
 * produce the volume geometry. Never fabricates a volume from inconsistent data.
 */
export function analyzeGeometry(instances: readonly DicomInstanceMeta[]): GeometryAnalysis {
  const issues: DiagnosticIssue[] = [];
  const empty: GeometryAnalysis['stats'] = {
    spacingMin: NaN, spacingMax: NaN, spacingMedian: NaN, spacingStdDev: NaN,
    spacingRelativeDeviation: NaN, duplicatePositions: 0, suspectedMissingSlices: 0,
    stackShearDeg: 0, reversedRelativeToInstanceNumber: false,
  };

  if (instances.length === 0) {
    return { slices: [], geometry: null, issues: [issue(ErrorCode.GEOMETRY_MISSING, 'fatal', 'No images were supplied for volume construction.')], stats: empty, strategy: 'reject' };
  }

  const withGeom = instances.filter((m) => m.imageOrientationPatient && m.imagePositionPatient);
  const withoutGeom = instances.length - withGeom.length;
  if (withoutGeom > 0) {
    issues.push(issue(ErrorCode.GEOMETRY_MISSING, withGeom.length === 0 ? 'fatal' : 'warning',
      `${withoutGeom} image${withoutGeom === 1 ? '' : 's'} lack Image Position/Orientation (Patient) and cannot be placed in space.`,
      { detail: 'Tags (0020,0032) and/or (0020,0037) are absent.', mitigation: withGeom.length > 0 ? 'These images were excluded from the volume.' : undefined }));
  }
  if (withGeom.length === 0) {
    return { slices: [], geometry: null, issues, stats: empty, strategy: 'reject' };
  }

  // --- orientation consistency -------------------------------------------------
  const refIop = withGeom[0].imageOrientationPatient!;
  const refRow = rowCosines(refIop), refCol = columnCosines(refIop);
  const inconsistent = withGeom.filter((m) => {
    const r = rowCosines(m.imageOrientationPatient!), c = columnCosines(m.imageOrientationPatient!);
    return !approxEqual(r, refRow, ORIENTATION_EPS) || !approxEqual(c, refCol, ORIENTATION_EPS);
  });
  if (inconsistent.length > 0) {
    issues.push(issue(ErrorCode.GEOMETRY_INCONSISTENT_ORIENTATION, 'fatal',
      `3D rendering cannot safely continue because ${inconsistent.length} slice${inconsistent.length === 1 ? ' has' : 's have'} inconsistent orientation.`,
      {
        detail: `Reference Image Orientation (Patient) = [${refIop.join(', ')}]. ` +
          `First differing instance: [${inconsistent[0].imageOrientationPatient!.join(', ')}].`,
        mitigation: 'Select a single reconstruction, or split the series before rendering.',
        context: { inconsistentCount: inconsistent.length },
      }));
    return { slices: [], geometry: null, issues, stats: empty, strategy: 'reject' };
  }

  // --- matrix / pixel spacing consistency --------------------------------------
  const rows = withGeom[0].rows, columns = withGeom[0].columns;
  const mixedMatrix = withGeom.filter((m) => m.rows !== rows || m.columns !== columns);
  if (mixedMatrix.length > 0) {
    issues.push(issue(ErrorCode.GEOMETRY_MIXED_MATRIX, 'fatal',
      `The selected images do not share one image matrix (${mixedMatrix.length} of ${withGeom.length} differ from ${columns}×${rows}).`,
      { mitigation: 'Choose a single reconstruction with a uniform matrix.' }));
    return { slices: [], geometry: null, issues, stats: empty, strategy: 'reject' };
  }
  const refPs = withGeom[0].pixelSpacing;
  if (refPs) {
    const mixedPs = withGeom.filter((m) => !m.pixelSpacing ||
      Math.abs(m.pixelSpacing[0] - refPs[0]) > 1e-4 || Math.abs(m.pixelSpacing[1] - refPs[1]) > 1e-4);
    if (mixedPs.length > 0) {
      issues.push(issue(ErrorCode.GEOMETRY_MIXED_PIXEL_SPACING, 'error',
        `${mixedPs.length} slice${mixedPs.length === 1 ? '' : 's'} report a different pixel spacing than the rest of the series.`,
        { detail: `Reference Pixel Spacing = [${refPs.join(', ')}] mm.` }));
    }
  } else {
    issues.push(issue(ErrorCode.GEOMETRY_MISSING, 'error',
      'Pixel Spacing (0028,0030) is missing; physical measurements would be meaningless.',
      { mitigation: 'Measurements are disabled for this series.' }));
  }

  // --- sort by physical position ----------------------------------------------
  const normal = sliceNormal(refIop);
  const unsorted: SliceRef[] = withGeom.map((meta) => {
    const position = meta.imagePositionPatient!;
    return { meta, frameIndex: 0, position, coordinate: sliceCoordinate(position, normal) };
  });
  const slices = [...unsorted].sort((a, b) => a.coordinate - b.coordinate);

  // --- spacing measurement -----------------------------------------------------
  const diffs: number[] = [];
  for (let i = 1; i < slices.length; i++) diffs.push(slices[i].coordinate - slices[i - 1].coordinate);
  const positiveDiffs = diffs.filter((d) => d > DUPLICATE_EPS_MM);
  const duplicatePositions = diffs.length - positiveDiffs.length;
  const medianSpacing = positiveDiffs.length > 0 ? median(positiveDiffs) : NaN;
  const spacingMin = positiveDiffs.length ? Math.min(...positiveDiffs) : NaN;
  const spacingMax = positiveDiffs.length ? Math.max(...positiveDiffs) : NaN;
  const mean = positiveDiffs.length ? positiveDiffs.reduce((a, b) => a + b, 0) / positiveDiffs.length : NaN;
  const spacingStdDev = positiveDiffs.length
    ? Math.sqrt(positiveDiffs.reduce((a, b) => a + (b - mean) ** 2, 0) / positiveDiffs.length) : NaN;
  const relDev = positiveDiffs.length
    ? Math.max(...positiveDiffs.map((d) => Math.abs(d - medianSpacing) / medianSpacing)) : 0;

  if (duplicatePositions > 0) {
    issues.push(issue(ErrorCode.GEOMETRY_DUPLICATE_POSITIONS, 'warning',
      `${duplicatePositions} image${duplicatePositions === 1 ? ' occupies' : 's occupy'} a slice position that is already taken.`,
      { detail: 'Two instances project to the same coordinate along the slice normal.',
        mitigation: 'Duplicates are kept in the slice list; the volume builder uses the first at each position.' }));
  }

  let suspectedMissingSlices = 0;
  if (Number.isFinite(medianSpacing) && medianSpacing > 0) {
    for (const d of positiveDiffs) {
      const k = Math.round(d / medianSpacing);
      if (k >= 2) suspectedMissingSlices += k - 1;
    }
  }
  if (suspectedMissingSlices > 0) {
    issues.push(issue(ErrorCode.GEOMETRY_MISSING_SLICES, 'warning',
      `The series appears to be missing about ${suspectedMissingSlices} slice${suspectedMissingSlices === 1 ? '' : 's'}: gaps of two or more slice intervals were found.`,
      { detail: `median spacing ${medianSpacing.toFixed(4)} mm, largest gap ${spacingMax.toFixed(4)} mm`,
        mitigation: 'The volume is reconstructed on a regular grid; gap regions are interpolated and must not be read as anatomy.' }));
  }

  if (relDev > SPACING_TOLERANCE && positiveDiffs.length > 1) {
    issues.push(issue(ErrorCode.GEOMETRY_IRREGULAR_SPACING, suspectedMissingSlices > 0 ? 'warning' : 'error',
      `Slice spacing is not uniform (it varies from ${spacingMin.toFixed(3)} mm to ${spacingMax.toFixed(3)} mm).`,
      { detail: `median ${medianSpacing.toFixed(4)} mm, σ ${spacingStdDev.toFixed(4)} mm, max relative deviation ${(relDev * 100).toFixed(2)} %`,
        mitigation: 'The volume is resampled onto a regular grid at the median spacing; this transformation is recorded in the presentation state.' }));
  }

  // --- gantry tilt / shear ------------------------------------------------------
  let stackShearDeg = 0;
  if (slices.length > 1) {
    const stackDir = normalize(sub(slices[slices.length - 1].position, slices[0].position));
    if (length(stackDir) > 0) stackShearDeg = Math.min(angleDeg(stackDir, normal), 180 - angleDeg(stackDir, normal));
  }
  const taggedTilt = withGeom[0].gantryDetectorTilt ?? 0;
  if (stackShearDeg > SHEAR_TOLERANCE_DEG || Math.abs(taggedTilt) > SHEAR_TOLERANCE_DEG) {
    issues.push(issue(ErrorCode.GEOMETRY_GANTRY_TILT, 'warning',
      `The acquisition is tilted: the slice stack runs ${stackShearDeg.toFixed(2)}° away from the slice normal` +
      (Math.abs(taggedTilt) > SHEAR_TOLERANCE_DEG ? ` (Gantry/Detector Tilt reports ${taggedTilt}°).` : '.'),
      { detail: 'A tilted stack is a sheared grid, not a rectilinear one.',
        mitigation: 'The volume is de-sheared onto an orthogonal grid before rendering; the applied shear is recorded.' }));
  }

  // --- reversal relative to InstanceNumber (informational only) -----------------
  let reversed = false;
  const withInstanceNumbers = slices.filter((s) => typeof s.meta.instanceNumber === 'number');
  if (withInstanceNumbers.length >= 2) {
    const first = withInstanceNumbers[0].meta.instanceNumber!;
    const last = withInstanceNumbers[withInstanceNumbers.length - 1].meta.instanceNumber!;
    reversed = last < first;
    if (reversed) {
      issues.push(issue(ErrorCode.GEOMETRY_MISSING, 'info',
        'Instance numbers run opposite to the physical slice order; physical position was used, as required.',
        { detail: `InstanceNumber ${first} → ${last} across increasing slice coordinate.` }));
    }
  }

  const stats = {
    spacingMin, spacingMax, spacingMedian: medianSpacing, spacingStdDev,
    spacingRelativeDeviation: relDev, duplicatePositions, suspectedMissingSlices,
    stackShearDeg, reversedRelativeToInstanceNumber: reversed,
  };

  // --- assemble geometry --------------------------------------------------------
  let spacingK = medianSpacing;
  let spacingSource: SpacingSource = 'measured';
  if (!Number.isFinite(spacingK) || spacingK <= 0) {
    const sbs = withGeom[0].spacingBetweenSlices;
    const st = withGeom[0].sliceThickness;
    if (sbs && sbs > 0) { spacingK = Math.abs(sbs); spacingSource = 'spacing-between-slices'; }
    else if (st && st > 0) { spacingK = st; spacingSource = 'slice-thickness';
      issues.push(issue(ErrorCode.GEOMETRY_MISSING, 'warning',
        'Inter-slice spacing could not be measured from image positions; Slice Thickness was used instead.',
        { mitigation: 'Distances along the slice axis may be inaccurate.' })); }
    else { spacingK = 1; spacingSource = 'assumed-unit';
      issues.push(issue(ErrorCode.GEOMETRY_MISSING, 'error',
        'No usable inter-slice spacing is available; 1 mm was assumed.',
        { mitigation: 'Measurements along the slice axis are disabled.' })); }
  }

  const psRow = refPs ? refPs[0] : 1;   // spacing between rows   -> along j
  const psCol = refPs ? refPs[1] : 1;   // spacing between columns-> along i
  const dimensions: [number, number, number] = [
    columns, rows,
    Number.isFinite(medianSpacing) && medianSpacing > 0
      ? Math.round((slices[slices.length - 1].coordinate - slices[0].coordinate) / spacingK) + 1
      : slices.length,
  ];

  const handedness = det3(refRow, refCol, normal) >= 0 ? 1 : -1;

  const geometry: VolumeGeometry = {
    origin: slices[0].position,
    spacing: [psCol, psRow, spacingK],
    iAxis: normalize(refRow),
    jAxis: normalize(refCol),
    kAxis: normal,
    dimensions,
    physicalSize: [dimensions[0] * psCol, dimensions[1] * psRow, dimensions[2] * spacingK],
    frameOfReferenceUID: withGeom[0].frameOfReferenceUID,
    patientPosition: withGeom[0].patientPosition,
    spacingSource,
    handedness,
  };

  const strategy: GeometryAnalysis['strategy'] =
    stackShearDeg > SHEAR_TOLERANCE_DEG ? 'shear-correct'
      : relDev > SPACING_TOLERANCE || suspectedMissingSlices > 0 ? 'resample-irregular'
        : 'regular';

  return { slices, geometry, issues, stats, strategy };
}

/* ------------------------------------------------------------------ anatomy */

/** Closest anatomical direction label for a world (LPS) vector. */
export function anatomicalLabel(v: Vec3): 'R' | 'L' | 'A' | 'P' | 'S' | 'I' {
  const n = normalize(v);
  const axes: Array<[number, 'R' | 'L' | 'A' | 'P' | 'S' | 'I']> = [
    [n[0], 'L'], [-n[0], 'R'], [n[1], 'P'], [-n[1], 'A'], [n[2], 'S'], [-n[2], 'I'],
  ];
  axes.sort((a, b) => b[0] - a[0]);
  return axes[0][1];
}

/** Three-letter orientation code of a basis, e.g. "LPS" for an identity axial volume. */
export function orientationCode(iAxis: Vec3, jAxis: Vec3, kAxis: Vec3): string {
  return anatomicalLabel(iAxis) + anatomicalLabel(jAxis) + anatomicalLabel(kAxis);
}

/** How confident we are that the anatomical directions are correct. */
export function orientationConfidence(iAxis: Vec3, jAxis: Vec3, kAxis: Vec3): {
  code: string; confident: boolean; maxObliquityDeg: number;
} {
  const axisFor = (v: Vec3): Vec3 => {
    const a = Math.abs(v[0]), b = Math.abs(v[1]), c = Math.abs(v[2]);
    if (a >= b && a >= c) return [Math.sign(v[0]), 0, 0];
    if (b >= c) return [0, Math.sign(v[1]), 0];
    return [0, 0, Math.sign(v[2])];
  };
  const obliquity = Math.max(
    angleDeg(iAxis, axisFor(iAxis)), angleDeg(jAxis, axisFor(jAxis)), angleDeg(kAxis, axisFor(kAxis)),
  );
  return {
    code: orientationCode(iAxis, jAxis, kAxis),
    confident: obliquity < 20,
    maxObliquityDeg: obliquity,
  };
}
