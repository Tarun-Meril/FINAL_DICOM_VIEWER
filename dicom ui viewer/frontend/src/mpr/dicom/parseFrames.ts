/**
 * DICOM -> FrameDescriptor adapter.
 *
 * Handles classic single-frame CT/MR objects AND Enhanced (multi-frame) CT/MR.
 * For Enhanced objects the geometry is resolved per frame from the Per-frame
 * Functional Groups Sequence, falling back to the Shared Functional Groups
 * Sequence and only then to the top-level dataset — the order required by the
 * standard. Nothing here assumes that geometry lives at the top level.
 */

import dicomParser from 'dicom-parser';
import { TAG } from './tags';
import type { FrameDescriptor } from '../core/geometry/types';

type DataSet = any;

function str(ds: DataSet, tag: string): string | undefined {
  try {
    const v = ds?.string?.(tag);
    return v === undefined || v === '' ? undefined : v;
  } catch {
    return undefined;
  }
}

function num(ds: DataSet, tag: string): number | undefined {
  try {
    const v = ds?.floatString?.(tag);
    return Number.isFinite(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

function intVal(ds: DataSet, tag: string): number | undefined {
  try {
    const v = ds?.intString?.(tag);
    if (Number.isFinite(v)) return v;
  } catch {
    /* fall through */
  }
  try {
    const v = ds?.uint16?.(tag);
    return Number.isFinite(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

function numArray(ds: DataSet, tag: string, expected: number): number[] | undefined {
  try {
    const element = ds?.elements?.[tag];
    if (!element) return undefined;
    const out: number[] = [];
    for (let i = 0; i < expected; i++) {
      const v = ds.floatString(tag, i);
      if (!Number.isFinite(v)) return undefined;
      out.push(v);
    }
    return out;
  } catch {
    return undefined;
  }
}

function multiString(ds: DataSet, tag: string): string[] | undefined {
  const v = str(ds, tag);
  return v === undefined ? undefined : v.split('\\').map((s) => s.trim());
}

/** First item of a sequence, or undefined. */
function seqItem(ds: DataSet, tag: string, index = 0): DataSet | undefined {
  const el = ds?.elements?.[tag];
  const items = el?.items;
  if (!items || items.length <= index) return undefined;
  return items[index].dataSet;
}

/**
 * Resolve one attribute through the Enhanced functional-group chain:
 *   per-frame group -> shared group -> top-level dataset.
 */
function resolveThroughGroups<T>(
  read: (ds: DataSet) => T | undefined,
  sequenceTag: string,
  perFrame: DataSet | undefined,
  shared: DataSet | undefined,
  top: DataSet,
): T | undefined {
  const fromPerFrame = perFrame ? read(seqItem(perFrame, sequenceTag)) : undefined;
  if (fromPerFrame !== undefined) return fromPerFrame;
  const fromShared = shared ? read(seqItem(shared, sequenceTag)) : undefined;
  if (fromShared !== undefined) return fromShared;
  return read(top);
}

export interface ParseOptions {
  /** Builds the engine-facing identifier for a frame (Cornerstone imageId). */
  readonly makeId: (sopInstanceUID: string, frameIndex: number) => string;
}

/**
 * Parse one DICOM P10 byte stream into one FrameDescriptor per frame.
 * Pixel data is NOT decoded here — only geometry and identity.
 */
export function parseFrameDescriptors(
  byteArray: Uint8Array,
  options: ParseOptions,
): FrameDescriptor[] {
  const ds: DataSet = dicomParser.parseDicom(byteArray);
  return frameDescriptorsFromDataSet(ds, options);
}

export function frameDescriptorsFromDataSet(
  ds: DataSet,
  options: ParseOptions,
): FrameDescriptor[] {
  const sopInstanceUID = str(ds, TAG.SOPInstanceUID) ?? '';
  const seriesInstanceUID = str(ds, TAG.SeriesInstanceUID) ?? '';
  const studyInstanceUID = str(ds, TAG.StudyInstanceUID) ?? '';
  const modality = str(ds, TAG.Modality) ?? '';
  const rows = intVal(ds, TAG.Rows) ?? 0;
  const columns = intVal(ds, TAG.Columns) ?? 0;
  const numberOfFrames = Number(str(ds, TAG.NumberOfFrames) ?? '1') || 1;

  const perFrameSeq = ds?.elements?.[TAG.PerFrameFunctionalGroupsSequence];
  const sharedSeq = seqItem(ds, TAG.SharedFunctionalGroupsSequence);

  const common = {
    sopInstanceUID,
    seriesInstanceUID,
    studyInstanceUID,
    modality,
    rows,
    columns,
    sopClassUID: str(ds, TAG.SOPClassUID),
    bitsAllocated: intVal(ds, TAG.BitsAllocated),
    bitsStored: intVal(ds, TAG.BitsStored),
    highBit: intVal(ds, TAG.HighBit),
    pixelRepresentation: intVal(ds, TAG.PixelRepresentation),
    samplesPerPixel: intVal(ds, TAG.SamplesPerPixel) ?? 1,
    photometricInterpretation:
      str(ds, TAG.PhotometricInterpretation) ?? 'MONOCHROME2',
    seriesDescription: str(ds, TAG.SeriesDescription),
    seriesNumber: intVal(ds, TAG.SeriesNumber),
    convolutionKernel: str(ds, TAG.ConvolutionKernel),
    acquisitionNumber: intVal(ds, TAG.AcquisitionNumber),
    echoNumber: intVal(ds, TAG.EchoNumber),
    patientPosition: str(ds, TAG.PatientPosition),
    frameOfReferenceUID: str(ds, TAG.FrameOfReferenceUID),
  };

  const topImageType = multiString(ds, TAG.ImageType);

  const out: FrameDescriptor[] = [];

  for (let f = 0; f < numberOfFrames; f++) {
    const perFrame =
      perFrameSeq?.items && perFrameSeq.items.length > f
        ? perFrameSeq.items[f].dataSet
        : undefined;

    const ipp =
      resolveThroughGroups(
        (d) => (d ? numArray(d, TAG.ImagePositionPatient, 3) : undefined),
        TAG.PlanePositionSequence,
        perFrame,
        sharedSeq,
        ds,
      ) ?? undefined;

    const iop =
      resolveThroughGroups(
        (d) => (d ? numArray(d, TAG.ImageOrientationPatient, 6) : undefined),
        TAG.PlaneOrientationSequence,
        perFrame,
        sharedSeq,
        ds,
      ) ?? undefined;

    const pixelSpacing =
      resolveThroughGroups(
        (d) => (d ? numArray(d, TAG.PixelSpacing, 2) : undefined),
        TAG.PixelMeasuresSequence,
        perFrame,
        sharedSeq,
        ds,
      ) ?? undefined;

    const sliceThickness = resolveThroughGroups(
      (d) => (d ? num(d, TAG.SliceThickness) : undefined),
      TAG.PixelMeasuresSequence,
      perFrame,
      sharedSeq,
      ds,
    );

    const spacingBetweenSlices = resolveThroughGroups(
      (d) => (d ? num(d, TAG.SpacingBetweenSlices) : undefined),
      TAG.PixelMeasuresSequence,
      perFrame,
      sharedSeq,
      ds,
    );

    const rescaleSlope = resolveThroughGroups(
      (d) => (d ? num(d, TAG.RescaleSlope) : undefined),
      TAG.PixelValueTransformationSequence,
      perFrame,
      sharedSeq,
      ds,
    );

    const rescaleIntercept = resolveThroughGroups(
      (d) => (d ? num(d, TAG.RescaleIntercept) : undefined),
      TAG.PixelValueTransformationSequence,
      perFrame,
      sharedSeq,
      ds,
    );

    const windowCenter = resolveThroughGroups(
      (d) => (d ? num(d, TAG.WindowCenter) : undefined),
      TAG.FrameVOILUTSequence,
      perFrame,
      sharedSeq,
      ds,
    );

    const windowWidth = resolveThroughGroups(
      (d) => (d ? num(d, TAG.WindowWidth) : undefined),
      TAG.FrameVOILUTSequence,
      perFrame,
      sharedSeq,
      ds,
    );

    // Enhanced objects carry the frame's type in the modality-specific frame
    // type sequence; this is where a localiser frame declares itself.
    const frameType =
      (perFrame &&
        (multiString(seqItem(perFrame, TAG.CTImageFrameTypeSequence), TAG.FrameType) ??
          multiString(seqItem(perFrame, TAG.MRImageFrameTypeSequence), TAG.FrameType))) ||
      (sharedSeq &&
        (multiString(seqItem(sharedSeq, TAG.CTImageFrameTypeSequence), TAG.FrameType) ??
          multiString(seqItem(sharedSeq, TAG.MRImageFrameTypeSequence), TAG.FrameType))) ||
      topImageType;

    const inStackPosition =
      perFrame && seqItem(perFrame, TAG.FrameContentSequence)
        ? intVal(seqItem(perFrame, TAG.FrameContentSequence), TAG.InStackPositionNumber)
        : undefined;

    out.push({
      ...common,
      id: options.makeId(sopInstanceUID, f),
      imagePositionPatient: (ipp ?? [NaN, NaN, NaN]) as [number, number, number],
      imageOrientationPatient: iop ?? [NaN, NaN, NaN, NaN, NaN, NaN],
      pixelSpacing: (pixelSpacing ?? [NaN, NaN]) as [number, number],
      sliceThickness,
      spacingBetweenSlices,
      instanceNumber: inStackPosition ?? intVal(ds, TAG.InstanceNumber),
      sliceLocation: num(ds, TAG.SliceLocation),
      imageType: frameType,
      rescaleSlope,
      rescaleIntercept,
      windowCenter,
      windowWidth,
      frameIndex: numberOfFrames > 1 ? f : undefined,
    });
  }

  return out;
}

export interface PatientStudyInfo {
  patientName?: string;
  patientId?: string;
  patientSex?: string;
  patientBirthDate?: string;
  studyDate?: string;
  studyTime?: string;
  studyDescription?: string;
  seriesDescription?: string;
  seriesNumber?: number;
  modality?: string;
  patientPosition?: string;
}

export function readPatientStudyInfo(ds: DataSet): PatientStudyInfo {
  return {
    patientName: str(ds, TAG.PatientName)?.replace(/\^/g, ' ').trim(),
    patientId: str(ds, TAG.PatientID),
    patientSex: str(ds, TAG.PatientSex),
    patientBirthDate: str(ds, TAG.PatientBirthDate),
    studyDate: str(ds, TAG.StudyDate),
    studyTime: str(ds, TAG.StudyTime),
    studyDescription: str(ds, TAG.StudyDescription),
    seriesDescription: str(ds, TAG.SeriesDescription),
    seriesNumber: intVal(ds, TAG.SeriesNumber),
    modality: str(ds, TAG.Modality),
    patientPosition: str(ds, TAG.PatientPosition),
  };
}
