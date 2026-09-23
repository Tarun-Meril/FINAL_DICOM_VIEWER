/**
 * SeriesValidator
 * ---------------
 * Decides whether a set of frames is a legitimate candidate for volumetric
 * reformatting, BEFORE any volume is built.
 *
 * Two separate jobs:
 *   1. Exclude images that must never be part of a volume (localiser / scout /
 *      topogram, dose reports, secondary capture, screen saves).
 *   2. Partition the remaining frames into spatially coherent groups so that
 *      an arterial phase is never silently fused with a venous phase, or a
 *      soft-kernel reconstruction with a bone-kernel reconstruction.
 */

import type { FrameDescriptor, GeometryIssue } from '../geometry/types';
import { directionsFromIOP } from '../geometry/DICOMGeometry';
import { angleDeg } from '../math/vec';

/** SOP Class UIDs that are never volumetric image data. */
const NON_IMAGE_SOP_CLASSES = new Set([
  '1.2.840.10008.5.1.4.1.1.7', // Secondary Capture Image Storage
  '1.2.840.10008.5.1.4.1.1.7.1',
  '1.2.840.10008.5.1.4.1.1.7.2',
  '1.2.840.10008.5.1.4.1.1.7.3',
  '1.2.840.10008.5.1.4.1.1.7.4',
  '1.2.840.10008.5.1.4.1.1.11.1', // Grayscale Softcopy Presentation State
  '1.2.840.10008.5.1.4.1.1.66', // Raw Data
  '1.2.840.10008.5.1.4.1.1.88.67', // X-Ray Radiation Dose SR
  '1.2.840.10008.5.1.4.1.1.104.1', // Encapsulated PDF
]);

const LOCALIZER_DESCRIPTION = /\b(scout|localizer|localiser|topogram|surview|scanogram|pilot|dose\s*report|patient\s*protocol|summary)\b/i;

export type ExclusionReason =
  | 'IMAGE_TYPE_LOCALIZER'
  | 'IMAGE_TYPE_PROJECTION'
  | 'IMAGE_TYPE_DERIVED_SECONDARY'
  | 'SERIES_DESCRIPTION_LOCALIZER'
  | 'NON_IMAGE_SOP_CLASS'
  | 'NO_GEOMETRY';

export interface ExcludedFrame {
  readonly frame: FrameDescriptor;
  readonly reason: ExclusionReason;
  readonly detail: string;
}

export interface SeriesFilterResult {
  readonly accepted: readonly FrameDescriptor[];
  readonly excluded: readonly ExcludedFrame[];
  readonly issues: readonly GeometryIssue[];
}

/**
 * Remove images that must not contribute to a reformatted volume.
 * Exclusion is always reported, never silent.
 */
export function excludeNonVolumetricFrames(
  frames: readonly FrameDescriptor[],
): SeriesFilterResult {
  const accepted: FrameDescriptor[] = [];
  const excluded: ExcludedFrame[] = [];

  for (const f of frames) {
    const type = (f.imageType ?? []).map((v) => v.toUpperCase());

    if (f.sopClassUID && NON_IMAGE_SOP_CLASSES.has(f.sopClassUID)) {
      excluded.push({
        frame: f,
        reason: 'NON_IMAGE_SOP_CLASS',
        detail: `SOP Class ${f.sopClassUID} is not volumetric image data.`,
      });
      continue;
    }
    if (type.includes('LOCALIZER')) {
      excluded.push({
        frame: f,
        reason: 'IMAGE_TYPE_LOCALIZER',
        detail: `ImageType = ${type.join('\\')}`,
      });
      continue;
    }
    if (type.includes('PROJECTION IMAGE') || type.includes('PROJECTION')) {
      excluded.push({
        frame: f,
        reason: 'IMAGE_TYPE_PROJECTION',
        detail: `ImageType = ${type.join('\\')}`,
      });
      continue;
    }
    if (type.includes('DERIVED') && type.includes('SECONDARY')) {
      excluded.push({
        frame: f,
        reason: 'IMAGE_TYPE_DERIVED_SECONDARY',
        detail: `ImageType = ${type.join('\\')}`,
      });
      continue;
    }
    if (f.seriesDescription && LOCALIZER_DESCRIPTION.test(f.seriesDescription)) {
      excluded.push({
        frame: f,
        reason: 'SERIES_DESCRIPTION_LOCALIZER',
        detail: `SeriesDescription = "${f.seriesDescription}"`,
      });
      continue;
    }
    if (
      !f.imageOrientationPatient ||
      f.imageOrientationPatient.length !== 6 ||
      !f.imagePositionPatient ||
      f.imagePositionPatient.length !== 3
    ) {
      excluded.push({
        frame: f,
        reason: 'NO_GEOMETRY',
        detail: 'Frame has no usable Image Position / Orientation (Patient).',
      });
      continue;
    }
    accepted.push(f);
  }

  const issues: GeometryIssue[] = [];
  if (excluded.length > 0) {
    const counts = new Map<ExclusionReason, number>();
    for (const e of excluded) counts.set(e.reason, (counts.get(e.reason) ?? 0) + 1);
    issues.push({
      code: 'LOCALIZER_EXCLUDED',
      severity: 'info',
      message: `${excluded.length} non-volumetric image(s) were excluded from the reformat (localiser / scout / non-image objects).`,
      detail: [...counts.entries()].map(([r, c]) => `${r}: ${c}`).join('; '),
    });
  }

  return { accepted, excluded, issues };
}

export interface SpatialGroup {
  readonly key: string;
  readonly frames: readonly FrameDescriptor[];
  readonly seriesInstanceUID: string;
  readonly frameOfReferenceUID?: string;
  readonly modality: string;
  readonly seriesDescription?: string;
  readonly seriesNumber?: number;
  readonly rows: number;
  readonly columns: number;
  readonly convolutionKernel?: string;
  readonly acquisitionNumber?: number;
  readonly echoNumber?: number;
}

/**
 * Partition frames into groups that are safe to fuse into one volume.
 *
 * Frames only join the same group when EVERY one of these matches:
 *   Series Instance UID, Frame of Reference UID, Modality, matrix size,
 *   pixel spacing, image orientation (to within 0.1 deg), convolution kernel,
 *   acquisition number and echo number.
 *
 * Splitting on acquisition number and kernel is what keeps an arterial phase
 * out of a venous-phase volume even when a scanner reuses one Series UID.
 */
export function groupFramesForVolume(
  frames: readonly FrameDescriptor[],
  orientationToleranceDeg = 0.1,
): SpatialGroup[] {
  const groups: Array<{
    meta: SpatialGroup;
    rowDir: ReturnType<typeof directionsFromIOP>['rowDirection'];
    colDir: ReturnType<typeof directionsFromIOP>['columnDirection'];
    frames: FrameDescriptor[];
  }> = [];

  for (const f of frames) {
    const dirs = directionsFromIOP(f.imageOrientationPatient);
    const coarseKey = [
      f.seriesInstanceUID,
      f.frameOfReferenceUID ?? 'NO-FOR',
      f.modality,
      `${f.columns}x${f.rows}`,
      `${f.pixelSpacing[0].toFixed(6)}/${f.pixelSpacing[1].toFixed(6)}`,
      f.convolutionKernel ?? '-',
      f.acquisitionNumber ?? '-',
      f.echoNumber ?? '-',
    ].join('|');

    const existing = groups.find(
      (g) =>
        g.meta.key.startsWith(coarseKey) &&
        angleDeg(g.rowDir, dirs.rowDirection) <= orientationToleranceDeg &&
        angleDeg(g.colDir, dirs.columnDirection) <= orientationToleranceDeg,
    );

    if (existing) {
      existing.frames.push(f);
      continue;
    }

    groups.push({
      meta: {
        key: `${coarseKey}|#${groups.length}`,
        frames: [],
        seriesInstanceUID: f.seriesInstanceUID,
        frameOfReferenceUID: f.frameOfReferenceUID,
        modality: f.modality,
        seriesDescription: f.seriesDescription,
        seriesNumber: f.seriesNumber,
        rows: f.rows,
        columns: f.columns,
        convolutionKernel: f.convolutionKernel,
        acquisitionNumber: f.acquisitionNumber,
        echoNumber: f.echoNumber,
      },
      rowDir: dirs.rowDirection,
      colDir: dirs.columnDirection,
      frames: [f],
    });
  }

  return groups
    .map((g) => ({ ...g.meta, frames: g.frames }))
    .sort((a, b) => b.frames.length - a.frames.length);
}

/**
 * Convenience: filter + group + pick the largest coherent group.
 * Returns every candidate so the UI can ask the user to choose explicitly
 * whenever more than one volumetric group is present.
 */
export function prepareCandidateVolumes(frames: readonly FrameDescriptor[]): {
  candidates: SpatialGroup[];
  filter: SeriesFilterResult;
} {
  const filter = excludeNonVolumetricFrames(frames);
  const candidates = groupFramesForVolume(filter.accepted).filter(
    (g) => g.frames.length >= 2,
  );
  return { candidates, filter };
}
