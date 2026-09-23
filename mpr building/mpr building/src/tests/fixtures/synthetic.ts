/**
 * Synthetic DICOM geometry fixtures.
 *
 * Each fixture is built from explicit patient-space parameters, so the
 * expected result of every geometry computation is known analytically. Tests
 * assert numerical agreement rather than visual similarity.
 */

import type { FrameDescriptor } from '../../core/geometry/types';
import {
  add,
  cross,
  normalize,
  scale,
  type Vec3,
} from '../../core/math/vec';

export interface SyntheticSeriesOptions {
  rows?: number;
  columns?: number;
  /** [betweenRows, betweenColumns] mm — DICOM order. */
  pixelSpacing?: [number, number];
  sliceSpacing?: number;
  sliceThickness?: number;
  numberOfSlices?: number;
  /** Direction of increasing column index. */
  rowDirection?: Vec3;
  /** Direction of increasing row index. */
  columnDirection?: Vec3;
  firstSliceOrigin?: Vec3;
  modality?: string;
  seriesInstanceUID?: string;
  frameOfReferenceUID?: string;
  /** Per-slice extra displacement, used to fabricate gantry-tilt shear. */
  perSliceInPlaneShift?: Vec3;
  /** Explicit per-slice spacing overrides (length = numberOfSlices-1). */
  gapOverrides?: number[];
  rescaleSlope?: number;
  rescaleIntercept?: number;
  imageType?: string[];
  seriesDescription?: string;
  multiFrame?: boolean;
}

export function makeSeries(options: SyntheticSeriesOptions = {}): FrameDescriptor[] {
  const {
    rows = 512,
    columns = 512,
    pixelSpacing = [0.7, 0.7],
    sliceSpacing = 1,
    sliceThickness = 1,
    numberOfSlices = 40,
    rowDirection = [1, 0, 0],
    columnDirection = [0, 1, 0],
    firstSliceOrigin = [-179.65, -179.65, -100],
    modality = 'CT',
    seriesInstanceUID = '1.2.3.4.5',
    frameOfReferenceUID = '1.2.3.4.5.99',
    perSliceInPlaneShift,
    gapOverrides,
    rescaleSlope = 1,
    rescaleIntercept = -1024,
    imageType = ['ORIGINAL', 'PRIMARY', 'AXIAL'],
    seriesDescription = 'Synthetic volumetric series',
    multiFrame = false,
  } = options;

  const normal = normalize(cross(normalize(rowDirection), normalize(columnDirection)));

  const frames: FrameDescriptor[] = [];
  let position: Vec3 = firstSliceOrigin;

  for (let k = 0; k < numberOfSlices; k++) {
    if (k > 0) {
      const gap = gapOverrides ? gapOverrides[k - 1] : sliceSpacing;
      position = add(position, scale(normal, gap));
      if (perSliceInPlaneShift) {
        position = add(position, perSliceInPlaneShift);
      }
    }
    frames.push({
      id: multiFrame ? `multiframe:0#${k}` : `synthetic:${k}`,
      sopInstanceUID: multiFrame ? '1.2.3.4.5.1000' : `1.2.3.4.5.${1000 + k}`,
      seriesInstanceUID,
      studyInstanceUID: '1.2.3.4',
      frameOfReferenceUID,
      modality,
      imagePositionPatient: position,
      imageOrientationPatient: [
        ...normalize(rowDirection),
        ...normalize(columnDirection),
      ],
      rows,
      columns,
      pixelSpacing,
      sliceThickness,
      spacingBetweenSlices: sliceSpacing,
      instanceNumber: k + 1,
      imageType,
      seriesDescription,
      sopClassUID: modality === 'CT'
        ? '1.2.840.10008.5.1.4.1.1.2'
        : '1.2.840.10008.5.1.4.1.1.4',
      rescaleSlope,
      rescaleIntercept: modality === 'CT' ? rescaleIntercept : undefined,
      frameIndex: multiFrame ? k : undefined,
    });
  }

  return frames;
}

/** A localiser/scout image that must never enter a volume. */
export function makeLocalizer(
  seriesInstanceUID = '1.2.3.4.5.localizer',
): FrameDescriptor {
  return {
    id: 'localizer:0',
    sopInstanceUID: '1.2.3.4.5.9000',
    seriesInstanceUID,
    studyInstanceUID: '1.2.3.4',
    frameOfReferenceUID: '1.2.3.4.5.99',
    modality: 'CT',
    imagePositionPatient: [-250, -250, 0],
    imageOrientationPatient: [1, 0, 0, 0, 0, -1],
    rows: 512,
    columns: 512,
    pixelSpacing: [1, 1],
    sliceThickness: 1,
    instanceNumber: 1,
    imageType: ['ORIGINAL', 'PRIMARY', 'LOCALIZER'],
    seriesDescription: 'Scout',
    sopClassUID: '1.2.840.10008.5.1.4.1.1.2',
  };
}

/** Rotation of a vector about an axis, used to build oblique fixtures. */
export function rotateAboutAxis(v: Vec3, axis: Vec3, degrees: number): Vec3 {
  const a = normalize(axis);
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const dotAV = a[0] * v[0] + a[1] * v[1] + a[2] * v[2];
  const crossAV = cross(a, v);
  return [
    v[0] * c + crossAV[0] * s + a[0] * dotAV * (1 - c),
    v[1] * c + crossAV[1] * s + a[1] * dotAV * (1 - c),
    v[2] * c + crossAV[2] * s + a[2] * dotAV * (1 - c),
  ];
}

/** Deterministic shuffle so "reversed / shuffled input order" tests are stable. */
export function shuffleDeterministic<T>(items: readonly T[], seed = 12345): T[] {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
