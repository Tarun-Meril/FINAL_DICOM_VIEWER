import type { Vec3, Mat3 } from '../math/vec';

/**
 * One geometric slice/frame, decoupled from any particular DICOM parser.
 *
 * A "frame" is either a single-frame SOP Instance or one frame of an Enhanced
 * (multi-frame) CT/MR object. The geometry layer treats them identically; it
 * is the DICOM adapter's job to resolve per-frame functional groups before
 * producing this structure.
 */
export interface FrameDescriptor {
  /** Stable identifier used by the rendering engine (Cornerstone imageId). */
  readonly id: string;
  readonly sopInstanceUID: string;
  readonly seriesInstanceUID: string;
  readonly studyInstanceUID: string;
  /** (0020,0052). May be absent in non-conformant data — that is a validation failure. */
  readonly frameOfReferenceUID?: string;
  readonly modality: string;

  /** (0020,0032) Image Position (Patient), mm, LPS. */
  readonly imagePositionPatient: Vec3;
  /**
   * (0020,0037) Image Orientation (Patient).
   * First triplet = direction of increasing COLUMN index (along a row).
   * Second triplet = direction of increasing ROW index (down a column).
   */
  readonly imageOrientationPatient: readonly number[];

  readonly rows: number;
  readonly columns: number;
  /** (0028,0030) Pixel Spacing = [betweenRows (mm, along column dir), betweenColumns (mm, along row dir)]. */
  readonly pixelSpacing: readonly [number, number];
  /** (0018,0050) mm. Physical detector/reconstruction thickness — NOT spacing. */
  readonly sliceThickness?: number;
  /** (0018,0088) mm. Nominal centre-to-centre spacing, when present. */
  readonly spacingBetweenSlices?: number;

  readonly instanceNumber?: number;
  /** (0020,1041) Kept for display only. Never used for ordering. */
  readonly sliceLocation?: number;

  readonly imageType?: readonly string[];
  readonly seriesDescription?: string;
  readonly seriesNumber?: number;
  readonly sopClassUID?: string;
  readonly convolutionKernel?: string;
  readonly acquisitionNumber?: number;
  readonly echoNumber?: number;
  readonly patientPosition?: string;

  /** (0028,0100) etc. Required by the renderer to allocate the volume. */
  readonly bitsAllocated?: number;
  readonly bitsStored?: number;
  readonly highBit?: number;
  /** (0028,0103) 0 = unsigned, 1 = two's complement. */
  readonly pixelRepresentation?: number;
  readonly samplesPerPixel?: number;
  readonly photometricInterpretation?: string;
  readonly planarConfiguration?: number;

  readonly rescaleSlope?: number;
  readonly rescaleIntercept?: number;
  readonly windowCenter?: number;
  readonly windowWidth?: number;

  /** Index of this frame inside its multi-frame object; undefined for single-frame. */
  readonly frameIndex?: number;
}

export type GeometrySeverity = 'info' | 'warning' | 'error';

export interface GeometryIssue {
  readonly code: GeometryIssueCode;
  readonly severity: GeometrySeverity;
  /** Clinician-facing text. */
  readonly message: string;
  /** Developer-facing detail, logged but not shown in clinical mode. */
  readonly detail: string;
}

export type GeometryIssueCode =
  | 'MISSING_IMAGE_POSITION'
  | 'MISSING_IMAGE_ORIENTATION'
  | 'MISSING_PIXEL_SPACING'
  | 'NON_ORTHOGONAL_ORIENTATION'
  | 'INCONSISTENT_ORIENTATION'
  | 'INCONSISTENT_DIMENSIONS'
  | 'INCONSISTENT_PIXEL_SPACING'
  | 'MIXED_FRAME_OF_REFERENCE'
  | 'MISSING_FRAME_OF_REFERENCE'
  | 'MIXED_SERIES'
  | 'MIXED_MODALITY'
  | 'DUPLICATE_SOP_INSTANCE'
  | 'COINCIDENT_SLICES'
  | 'IRREGULAR_SLICE_SPACING'
  | 'MISSING_SLICES'
  | 'GANTRY_TILT_SHEAR'
  | 'INSUFFICIENT_SLICES'
  | 'ANISOTROPIC_VOXELS'
  | 'THICK_SLICES'
  | 'OVERLAPPING_SLICES'
  | 'SPACING_THICKNESS_MISMATCH'
  | 'LOCALIZER_EXCLUDED'
  | 'MIXED_KERNEL'
  | 'MIXED_ACQUISITION';

/** Whether MPR may be built, built with caveats, or must be refused. */
export type GeometryVerdict = 'ok' | 'ok-with-warnings' | 'unsafe';

export interface SliceSpacingAnalysis {
  /** Signed positions of each sorted slice along the slice normal, mm. */
  readonly positions: readonly number[];
  /** Consecutive gaps, mm. */
  readonly gaps: readonly number[];
  /** Median gap — the value used as the volume's k spacing. */
  readonly medianGap: number;
  readonly minGap: number;
  readonly maxGap: number;
  /** max|gap - median| / median. */
  readonly maxRelativeDeviation: number;
  readonly regular: boolean;
  /** Indices (into the sorted array) after which an integer-multiple gap was found. */
  readonly missingSliceIndices: readonly number[];
  /** Estimated number of absent slices implied by integer-multiple gaps. */
  readonly estimatedMissingCount: number;
}

export interface GantryTiltAnalysis {
  /**
   * Angle between the inter-slice displacement vector and the slice normal.
   * 0 => the stack is a clean rectilinear prism.
   * >0 => the stack is sheared (classic CT gantry tilt): slices are parallel
   *       to each other but their origins march obliquely.
   */
  readonly shearAngleDeg: number;
  readonly sheared: boolean;
  /** In-plane component of the mean inter-slice step, mm (row, column). */
  readonly inPlaneStepMm: readonly [number, number];
}

export interface SeriesGeometry {
  readonly frames: readonly FrameDescriptor[];
  /** Direction of increasing i (column index) in patient space. */
  readonly rowDirection: Vec3;
  /** Direction of increasing j (row index) in patient space. */
  readonly columnDirection: Vec3;
  /** normalize(cross(rowDirection, columnDirection)). Direction of increasing k. */
  readonly sliceNormal: Vec3;
  /** IPP of the first slice in sorted order — the volume origin. */
  readonly origin: Vec3;
  /** [columns, rows, numberOfSlices] */
  readonly dimensions: readonly [number, number, number];
  /** [mm along i, mm along j, mm along k] */
  readonly spacing: readonly [number, number, number];
  /** Column-major 3x3 with columns rowDirection, columnDirection, sliceNormal. */
  readonly direction: Mat3;
  readonly frameOfReferenceUID?: string;
  readonly seriesInstanceUID: string;
  readonly modality: string;
  readonly spacingAnalysis: SliceSpacingAnalysis;
  readonly gantryTilt: GantryTiltAnalysis;
  readonly issues: readonly GeometryIssue[];
  readonly verdict: GeometryVerdict;
  /** True when the acquisition plane is not one of the three cardinal planes. */
  readonly oblique: boolean;
  /** Closest cardinal plane to the acquisition plane. */
  readonly acquisitionPlane: 'axial' | 'coronal' | 'sagittal' | 'oblique';
}
