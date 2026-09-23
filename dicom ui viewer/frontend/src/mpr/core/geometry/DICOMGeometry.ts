/**
 * DICOMGeometry
 * -------------
 * Derives a mathematically explicit, patient-space description of a candidate
 * MPR series from raw DICOM geometry tags.
 *
 * Non-negotiable rules encoded here (see production-safety requirements):
 *  - Slice ordering comes from the projection of Image Position (Patient) onto
 *    the slice normal. InstanceNumber, SliceLocation and file order are never
 *    used to establish geometry.
 *  - Slice thickness (0018,0050) is never treated as slice spacing.
 *  - Image Orientation (Patient) is never assumed to be identity.
 *  - No geometry defect is silently repaired. Every deviation is reported as a
 *    GeometryIssue and escalates the verdict.
 */

import {
  add,
  angleDeg,
  cross,
  dot,
  mat3FromColumns,
  normalize,
  scale,
  sub,
  vec3,
  type Vec3,
} from '../math/vec';
import type {
  FrameDescriptor,
  GantryTiltAnalysis,
  GeometryIssue,
  GeometryVerdict,
  SeriesGeometry,
  SliceSpacingAnalysis,
} from './types';

export interface GeometryTolerances {
  /** Max |dot(rowDir, colDir)| accepted before the orientation is called non-orthogonal. */
  orthogonalityDot: number;
  /** Max angle (deg) between two frames' orientation vectors before they are "inconsistent". */
  orientationAngleDeg: number;
  /** Relative tolerance on pixel spacing equality across frames. */
  pixelSpacingRelative: number;
  /** Spacing is "regular" at or below this relative deviation from the median gap. */
  spacingRegularRelative: number;
  /** Above this relative deviation the series is refused outright. */
  spacingUnsafeRelative: number;
  /** Absolute spacing tolerance (mm) that always counts as regular. */
  spacingRegularAbsoluteMm: number;
  /** Two slices closer than this along the normal are treated as coincident. */
  coincidentMm: number;
  /** Inter-slice step is called sheared (gantry tilt) above this angle. */
  shearAngleDeg: number;
  /** Median gap above this is flagged as thick-slice data. */
  thickSliceMm: number;
  /** Through-plane / in-plane spacing ratio above this is flagged as anisotropic. */
  anisotropyRatio: number;
  /** A gap is "missing slices" when gap/median is within this of an integer >= 2. */
  missingSliceIntegerTolerance: number;
}

export const DEFAULT_TOLERANCES: GeometryTolerances = {
  orthogonalityDot: 1e-3,
  orientationAngleDeg: 0.1,
  pixelSpacingRelative: 1e-3,
  spacingRegularRelative: 0.01,
  spacingUnsafeRelative: 0.1,
  spacingRegularAbsoluteMm: 0.01,
  coincidentMm: 1e-4,
  shearAngleDeg: 0.1,
  thickSliceMm: 3.0,
  anisotropyRatio: 2.0,
  missingSliceIntegerTolerance: 0.05,
};

function issue(
  code: GeometryIssue['code'],
  severity: GeometryIssue['severity'],
  message: string,
  detail: string,
): GeometryIssue {
  return { code, severity, message, detail };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Row/column direction cosines from (0020,0037). */
export function directionsFromIOP(iop: readonly number[]): {
  rowDirection: Vec3;
  columnDirection: Vec3;
} {
  if (!iop || iop.length !== 6 || iop.some((v) => !Number.isFinite(v))) {
    throw new Error(
      `Image Orientation (Patient) must contain 6 finite values, received: ${JSON.stringify(iop)}`,
    );
  }
  return {
    rowDirection: normalize(vec3(iop[0], iop[1], iop[2])),
    columnDirection: normalize(vec3(iop[3], iop[4], iop[5])),
  };
}

/**
 * Slice normal, defined exactly as required:
 *   sliceNormal = normalize(cross(rowDirection, columnDirection))
 * This yields a right-handed (i, j, k) basis, so the volume can never be
 * constructed with mirrored anatomy.
 */
export function computeSliceNormal(
  rowDirection: Vec3,
  columnDirection: Vec3,
): Vec3 {
  return normalize(cross(rowDirection, columnDirection));
}

/** Signed patient-space position of a frame along the slice normal, mm. */
export function slicePositionAlongNormal(
  frame: FrameDescriptor,
  sliceNormal: Vec3,
): number {
  return dot(frame.imagePositionPatient, sliceNormal);
}

/**
 * Sort frames by true patient-space position. Deterministic tie-break on
 * SOP Instance UID keeps the result stable for coincident frames (which are
 * reported as an issue, never silently merged).
 */
export function sortFramesByPosition(
  frames: readonly FrameDescriptor[],
  sliceNormal: Vec3,
): FrameDescriptor[] {
  return [...frames].sort((a, b) => {
    const da = slicePositionAlongNormal(a, sliceNormal);
    const db = slicePositionAlongNormal(b, sliceNormal);
    if (da !== db) return da - db;
    const fa = a.frameIndex ?? 0;
    const fb = b.frameIndex ?? 0;
    if (fa !== fb) return fa - fb;
    return a.sopInstanceUID.localeCompare(b.sopInstanceUID);
  });
}

export function analyseSliceSpacing(
  sortedFrames: readonly FrameDescriptor[],
  sliceNormal: Vec3,
  tol: GeometryTolerances = DEFAULT_TOLERANCES,
): SliceSpacingAnalysis {
  const positions = sortedFrames.map((f) =>
    slicePositionAlongNormal(f, sliceNormal),
  );
  const gaps: number[] = [];
  for (let i = 1; i < positions.length; i++) {
    gaps.push(positions[i] - positions[i - 1]);
  }
  const med = median(gaps);
  const minGap = gaps.length ? Math.min(...gaps) : NaN;
  const maxGap = gaps.length ? Math.max(...gaps) : NaN;

  const missingSliceIndices: number[] = [];
  let estimatedMissingCount = 0;
  let maxRelativeDeviation = 0;

  if (Number.isFinite(med) && med > 0) {
    for (let i = 0; i < gaps.length; i++) {
      const ratio = gaps[i] / med;
      const nearestInteger = Math.round(ratio);
      const integerError = Math.abs(ratio - nearestInteger);
      if (nearestInteger >= 2 && integerError <= tol.missingSliceIntegerTolerance) {
        // A clean integer multiple of the nominal gap: slices are absent from
        // an otherwise regular stack. Reported separately from jitter.
        missingSliceIndices.push(i);
        estimatedMissingCount += nearestInteger - 1;
        continue;
      }
      const dev = Math.abs(gaps[i] - med) / med;
      if (dev > maxRelativeDeviation) maxRelativeDeviation = dev;
    }
  }

  const absOk =
    gaps.length > 0 &&
    gaps.every(
      (g, i) =>
        missingSliceIndices.includes(i) ||
        Math.abs(g - med) <= tol.spacingRegularAbsoluteMm,
    );

  const regular =
    gaps.length > 0 &&
    (absOk || maxRelativeDeviation <= tol.spacingRegularRelative);

  return {
    positions,
    gaps,
    medianGap: med,
    minGap,
    maxGap,
    maxRelativeDeviation,
    regular,
    missingSliceIndices,
    estimatedMissingCount,
  };
}

/**
 * Gantry-tilt (shear) detection.
 *
 * A tilted-gantry CT produces slices that are mutually parallel but whose
 * origins step obliquely: the displacement between consecutive Image Position
 * (Patient) values is NOT parallel to the slice normal. Treating such a stack
 * as a rectilinear prism skews every reformat, so the shear is measured
 * explicitly here and reported rather than ignored.
 */
export function analyseGantryTilt(
  sortedFrames: readonly FrameDescriptor[],
  rowDirection: Vec3,
  columnDirection: Vec3,
  sliceNormal: Vec3,
  tol: GeometryTolerances = DEFAULT_TOLERANCES,
): GantryTiltAnalysis {
  if (sortedFrames.length < 2) {
    return { shearAngleDeg: 0, sheared: false, inPlaneStepMm: [0, 0] };
  }
  const first = sortedFrames[0].imagePositionPatient;
  const last = sortedFrames[sortedFrames.length - 1].imagePositionPatient;
  const total = sub(last, first);
  const n = sortedFrames.length - 1;
  const meanStep: Vec3 = scale(total, 1 / n);

  const inPlaneRow = dot(meanStep, rowDirection);
  const inPlaneCol = dot(meanStep, columnDirection);
  const alongNormal = dot(meanStep, sliceNormal);

  let shearAngleDeg = 0;
  if (Math.hypot(inPlaneRow, inPlaneCol, alongNormal) > 1e-9) {
    shearAngleDeg = angleDeg(
      meanStep,
      alongNormal >= 0 ? sliceNormal : scale(sliceNormal, -1),
    );
  }

  return {
    shearAngleDeg,
    sheared: shearAngleDeg > tol.shearAngleDeg,
    inPlaneStepMm: [inPlaneRow, inPlaneCol],
  };
}

/** Classify the acquisition plane from the true slice normal. */
export function classifyAcquisitionPlane(
  sliceNormal: Vec3,
  obliqueThresholdDeg = 15,
): { plane: 'axial' | 'coronal' | 'sagittal' | 'oblique'; oblique: boolean } {
  const axes: Array<{ name: 'sagittal' | 'coronal' | 'axial'; v: Vec3 }> = [
    { name: 'sagittal', v: [1, 0, 0] },
    { name: 'coronal', v: [0, 1, 0] },
    { name: 'axial', v: [0, 0, 1] },
  ];
  let best = axes[0];
  let bestAbsDot = -1;
  for (const a of axes) {
    const d = Math.abs(dot(sliceNormal, a.v));
    if (d > bestAbsDot) {
      bestAbsDot = d;
      best = a;
    }
  }
  const deviationDeg = (Math.acos(Math.min(1, bestAbsDot)) * 180) / Math.PI;
  const oblique = deviationDeg > obliqueThresholdDeg;
  return { plane: oblique ? 'oblique' : best.name, oblique };
}

export interface BuildGeometryOptions {
  tolerances?: Partial<GeometryTolerances>;
  /**
   * When true, a stack with an integer-multiple gap (absent slices) is still
   * allowed to build with a warning. When false it is refused.
   */
  allowMissingSlices?: boolean;
}

/**
 * Build the patient-space geometry of a candidate MPR series.
 *
 * Throws only for programmer error (empty input). Every data defect is
 * returned through `issues` / `verdict` so the caller can present a
 * clinically-safe message instead of a wrong image.
 */
export function buildSeriesGeometry(
  inputFrames: readonly FrameDescriptor[],
  options: BuildGeometryOptions = {},
): SeriesGeometry {
  if (!inputFrames || inputFrames.length === 0) {
    throw new Error('buildSeriesGeometry requires at least one frame');
  }
  const tol: GeometryTolerances = { ...DEFAULT_TOLERANCES, ...options.tolerances };
  const issues: GeometryIssue[] = [];

  // ---- 1. Per-frame tag presence -----------------------------------------
  for (const f of inputFrames) {
    if (
      !f.imagePositionPatient ||
      f.imagePositionPatient.length !== 3 ||
      f.imagePositionPatient.some((v) => !Number.isFinite(v))
    ) {
      issues.push(
        issue(
          'MISSING_IMAGE_POSITION',
          'error',
          'One or more images have no usable Image Position (Patient).',
          `SOP ${f.sopInstanceUID} frame ${f.frameIndex ?? 0}: IPP=${JSON.stringify(f.imagePositionPatient)}`,
        ),
      );
    }
    if (!f.imageOrientationPatient || f.imageOrientationPatient.length !== 6) {
      issues.push(
        issue(
          'MISSING_IMAGE_ORIENTATION',
          'error',
          'One or more images have no usable Image Orientation (Patient).',
          `SOP ${f.sopInstanceUID} frame ${f.frameIndex ?? 0}: IOP=${JSON.stringify(f.imageOrientationPatient)}`,
        ),
      );
    }
    if (
      !f.pixelSpacing ||
      f.pixelSpacing.length !== 2 ||
      !(f.pixelSpacing[0] > 0) ||
      !(f.pixelSpacing[1] > 0)
    ) {
      issues.push(
        issue(
          'MISSING_PIXEL_SPACING',
          'error',
          'One or more images have no usable Pixel Spacing. Physical measurements are impossible.',
          `SOP ${f.sopInstanceUID}: PixelSpacing=${JSON.stringify(f.pixelSpacing)}`,
        ),
      );
    }
  }

  if (issues.some((i) => i.severity === 'error')) {
    return failed(inputFrames, issues);
  }

  // ---- 2. Cross-frame consistency ----------------------------------------
  const reference = inputFrames[0];
  const { rowDirection, columnDirection } = directionsFromIOP(
    reference.imageOrientationPatient,
  );

  if (Math.abs(dot(rowDirection, columnDirection)) > tol.orthogonalityDot) {
    issues.push(
      issue(
        'NON_ORTHOGONAL_ORIENTATION',
        'error',
        'The image orientation vectors are not perpendicular. The series geometry is non-conformant.',
        `dot(row,col)=${dot(rowDirection, columnDirection)} exceeds tolerance ${tol.orthogonalityDot}`,
      ),
    );
    return failed(inputFrames, issues);
  }

  const seriesUIDs = new Set(inputFrames.map((f) => f.seriesInstanceUID));
  if (seriesUIDs.size > 1) {
    issues.push(
      issue(
        'MIXED_SERIES',
        'error',
        'The selected images belong to more than one series. A volume cannot be built from mixed series.',
        `SeriesInstanceUIDs: ${[...seriesUIDs].join(', ')}`,
      ),
    );
  }

  const modalities = new Set(inputFrames.map((f) => f.modality));
  if (modalities.size > 1) {
    issues.push(
      issue(
        'MIXED_MODALITY',
        'error',
        'The selected images have more than one modality.',
        `Modalities: ${[...modalities].join(', ')}`,
      ),
    );
  }

  const forUIDs = new Set(
    inputFrames.map((f) => f.frameOfReferenceUID).filter(Boolean) as string[],
  );
  if (forUIDs.size > 1) {
    issues.push(
      issue(
        'MIXED_FRAME_OF_REFERENCE',
        'error',
        'The selected images do not share a Frame of Reference. Their spatial relationship is undefined.',
        `FrameOfReferenceUIDs: ${[...forUIDs].join(', ')}`,
      ),
    );
  } else if (forUIDs.size === 0) {
    issues.push(
      issue(
        'MISSING_FRAME_OF_REFERENCE',
        'warning',
        'No Frame of Reference UID is present. Spatial consistency cannot be fully verified.',
        'Tag (0020,0052) absent on every frame.',
      ),
    );
  }

  const sopKeys = inputFrames.map(
    (f) => `${f.sopInstanceUID}#${f.frameIndex ?? 0}`,
  );
  if (new Set(sopKeys).size !== sopKeys.length) {
    issues.push(
      issue(
        'DUPLICATE_SOP_INSTANCE',
        'error',
        'The selected images contain duplicates.',
        `${sopKeys.length - new Set(sopKeys).size} duplicate SOP Instance / frame keys.`,
      ),
    );
  }

  for (const f of inputFrames) {
    if (f.rows !== reference.rows || f.columns !== reference.columns) {
      issues.push(
        issue(
          'INCONSISTENT_DIMENSIONS',
          'error',
          'The images in this series do not all have the same matrix size.',
          `Expected ${reference.columns}x${reference.rows}, found ${f.columns}x${f.rows} on ${f.sopInstanceUID}`,
        ),
      );
      break;
    }
  }

  for (const f of inputFrames) {
    const relRow =
      Math.abs(f.pixelSpacing[0] - reference.pixelSpacing[0]) /
      reference.pixelSpacing[0];
    const relCol =
      Math.abs(f.pixelSpacing[1] - reference.pixelSpacing[1]) /
      reference.pixelSpacing[1];
    if (relRow > tol.pixelSpacingRelative || relCol > tol.pixelSpacingRelative) {
      issues.push(
        issue(
          'INCONSISTENT_PIXEL_SPACING',
          'error',
          'Pixel spacing is not constant across the series. Measurements would be unreliable.',
          `Reference ${JSON.stringify(reference.pixelSpacing)} vs ${JSON.stringify(f.pixelSpacing)} on ${f.sopInstanceUID}`,
        ),
      );
      break;
    }
  }

  for (const f of inputFrames) {
    const d = directionsFromIOP(f.imageOrientationPatient);
    const aRow = angleDeg(d.rowDirection, rowDirection);
    const aCol = angleDeg(d.columnDirection, columnDirection);
    if (aRow > tol.orientationAngleDeg || aCol > tol.orientationAngleDeg) {
      issues.push(
        issue(
          'INCONSISTENT_ORIENTATION',
          'error',
          'The images are not all parallel. This is not a single volumetric acquisition.',
          `Frame ${f.sopInstanceUID} deviates by ${aRow.toFixed(3)} deg (row) / ${aCol.toFixed(3)} deg (column).`,
        ),
      );
      break;
    }
  }

  if (issues.some((i) => i.severity === 'error')) {
    return failed(inputFrames, issues);
  }

  // ---- 3. Ordering by true patient-space position ------------------------
  const sliceNormal = computeSliceNormal(rowDirection, columnDirection);
  const frames = sortFramesByPosition(inputFrames, sliceNormal);

  if (frames.length < 2) {
    issues.push(
      issue(
        'INSUFFICIENT_SLICES',
        'error',
        'MPR requires a volumetric series. This selection contains a single image.',
        `Frame count = ${frames.length}`,
      ),
    );
    return failed(frames, issues);
  }

  const spacingAnalysis = analyseSliceSpacing(frames, sliceNormal, tol);

  if (spacingAnalysis.minGap <= tol.coincidentMm) {
    issues.push(
      issue(
        'COINCIDENT_SLICES',
        'error',
        'Two or more images occupy the same spatial position. The series is not a clean volume.',
        `Minimum inter-slice gap ${spacingAnalysis.minGap} mm at or below ${tol.coincidentMm} mm.`,
      ),
    );
    return failed(frames, issues);
  }

  if (spacingAnalysis.missingSliceIndices.length > 0) {
    const severity = options.allowMissingSlices ? 'warning' : 'error';
    issues.push(
      issue(
        'MISSING_SLICES',
        severity,
        `This series appears to be missing approximately ${spacingAnalysis.estimatedMissingCount} slice(s). Reformatted images would contain fabricated anatomy across the gap.`,
        `Integer-multiple gaps after sorted indices [${spacingAnalysis.missingSliceIndices.join(', ')}], median gap ${spacingAnalysis.medianGap.toFixed(4)} mm.`,
      ),
    );
  }

  if (!spacingAnalysis.regular) {
    const unsafe =
      spacingAnalysis.maxRelativeDeviation > tol.spacingUnsafeRelative;
    issues.push(
      issue(
        'IRREGULAR_SLICE_SPACING',
        unsafe ? 'error' : 'warning',
        unsafe
          ? 'Slice spacing is irregular beyond the safe limit. Coronal and sagittal reformats from this series would be geometrically incorrect.'
          : 'Slice spacing varies slightly. Reformats use the median spacing; small through-plane error is possible.',
        `median=${spacingAnalysis.medianGap.toFixed(4)} mm, min=${spacingAnalysis.minGap.toFixed(4)} mm, max=${spacingAnalysis.maxGap.toFixed(4)} mm, maxRelDev=${(spacingAnalysis.maxRelativeDeviation * 100).toFixed(2)}%`,
      ),
    );
  }

  const gantryTilt = analyseGantryTilt(
    frames,
    rowDirection,
    columnDirection,
    sliceNormal,
    tol,
  );
  if (gantryTilt.sheared) {
    issues.push(
      issue(
        'GANTRY_TILT_SHEAR',
        'warning',
        `This acquisition is sheared (gantry tilt ≈ ${gantryTilt.shearAngleDeg.toFixed(2)}°). The volume is built on the true slice geometry; reformats are corrected for the tilt.`,
        `Mean inter-slice step has in-plane components row=${gantryTilt.inPlaneStepMm[0].toFixed(4)} mm, col=${gantryTilt.inPlaneStepMm[1].toFixed(4)} mm.`,
      ),
    );
  }

  // ---- 4. Volume descriptor ----------------------------------------------
  // Pixel Spacing is [between rows, between columns]:
  //   spacing along i (columns / rowDirection) = pixelSpacing[1]
  //   spacing along j (rows    / columnDirection) = pixelSpacing[0]
  const spacingI = reference.pixelSpacing[1];
  const spacingJ = reference.pixelSpacing[0];
  const spacingK = spacingAnalysis.medianGap;

  const nominalSpacing =
    reference.spacingBetweenSlices ?? reference.sliceThickness;
  if (
    nominalSpacing &&
    Math.abs(nominalSpacing - spacingK) / spacingK > 0.02 &&
    reference.spacingBetweenSlices != null
  ) {
    issues.push(
      issue(
        'SPACING_THICKNESS_MISMATCH',
        'info',
        'Measured slice spacing differs from the declared Spacing Between Slices. The measured geometry is used.',
        `Declared ${nominalSpacing} mm vs measured ${spacingK.toFixed(4)} mm.`,
      ),
    );
  }

  if (
    reference.sliceThickness &&
    spacingK < reference.sliceThickness * 0.98
  ) {
    issues.push(
      issue(
        'OVERLAPPING_SLICES',
        'info',
        'Slices overlap (spacing is smaller than slice thickness). This is normal for overlapping reconstructions.',
        `thickness=${reference.sliceThickness} mm, spacing=${spacingK.toFixed(4)} mm.`,
      ),
    );
  }

  if (spacingK > tol.thickSliceMm) {
    issues.push(
      issue(
        'THICK_SLICES',
        'warning',
        `Through-plane spacing is ${spacingK.toFixed(2)} mm. Coronal and sagittal reformats will be coarse in the through-plane direction.`,
        `medianGap=${spacingK.toFixed(4)} mm exceeds ${tol.thickSliceMm} mm.`,
      ),
    );
  }

  const minInPlane = Math.min(spacingI, spacingJ);
  if (spacingK / minInPlane > tol.anisotropyRatio) {
    issues.push(
      issue(
        'ANISOTROPIC_VOXELS',
        'info',
        `Voxels are anisotropic (${spacingI.toFixed(2)} × ${spacingJ.toFixed(2)} × ${spacingK.toFixed(2)} mm). Reformats preserve true anatomical proportions.`,
        `ratio through-plane/in-plane = ${(spacingK / minInPlane).toFixed(2)}`,
      ),
    );
  }

  const { plane, oblique } = classifyAcquisitionPlane(sliceNormal);

  const verdict: GeometryVerdict = issues.some((i) => i.severity === 'error')
    ? 'unsafe'
    : issues.some((i) => i.severity === 'warning')
      ? 'ok-with-warnings'
      : 'ok';

  return {
    frames,
    rowDirection,
    columnDirection,
    sliceNormal,
    origin: frames[0].imagePositionPatient,
    dimensions: [reference.columns, reference.rows, frames.length],
    spacing: [spacingI, spacingJ, spacingK],
    direction: mat3FromColumns(rowDirection, columnDirection, sliceNormal),
    frameOfReferenceUID: reference.frameOfReferenceUID,
    seriesInstanceUID: reference.seriesInstanceUID,
    modality: reference.modality,
    spacingAnalysis,
    gantryTilt,
    issues,
    verdict,
    oblique,
    acquisitionPlane: plane,
  };
}

/** Geometry object for a series that cannot be reformatted. */
function failed(
  frames: readonly FrameDescriptor[],
  issues: GeometryIssue[],
): SeriesGeometry {
  const f = frames[0];
  const zero: Vec3 = [0, 0, 0];
  return {
    frames,
    rowDirection: [1, 0, 0],
    columnDirection: [0, 1, 0],
    sliceNormal: [0, 0, 1],
    origin: zero,
    dimensions: [f?.columns ?? 0, f?.rows ?? 0, frames.length],
    spacing: [1, 1, 1],
    direction: mat3FromColumns([1, 0, 0], [0, 1, 0], [0, 0, 1]),
    frameOfReferenceUID: f?.frameOfReferenceUID,
    seriesInstanceUID: f?.seriesInstanceUID ?? '',
    modality: f?.modality ?? '',
    spacingAnalysis: {
      positions: [],
      gaps: [],
      medianGap: NaN,
      minGap: NaN,
      maxGap: NaN,
      maxRelativeDeviation: NaN,
      regular: false,
      missingSliceIndices: [],
      estimatedMissingCount: 0,
    },
    gantryTilt: { shearAngleDeg: 0, sheared: false, inPlaneStepMm: [0, 0] },
    issues,
    verdict: 'unsafe',
    oblique: false,
    acquisitionPlane: 'oblique',
  };
}

/**
 * Corner of the volume opposite the origin — useful for bounds checks and for
 * seeding the reference point at the geometric centre of the patient volume.
 */
export function volumeCentreWorld(geometry: SeriesGeometry): Vec3 {
  const [nx, ny, nz] = geometry.dimensions;
  const [sx, sy, sz] = geometry.spacing;
  return add(
    geometry.origin,
    add(
      add(
        scale(geometry.rowDirection, ((nx - 1) * sx) / 2),
        scale(geometry.columnDirection, ((ny - 1) * sy) / 2),
      ),
      scale(geometry.sliceNormal, ((nz - 1) * sz) / 2),
    ),
  );
}
