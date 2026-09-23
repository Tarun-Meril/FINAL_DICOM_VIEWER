import dicomParser from 'dicom-parser';
import { T } from './dictionary';
import { detectDicom } from './detect';
import { MedViewError, ErrorCode } from '@3d/core/errors';
import type { DicomInstanceMeta, PixelEncoding, RescaleInfo } from './types';
import type { Vec3 } from '@3d/math/vec3';

export type DataSet = dicomParser.DataSet;

/** Parse a DICOM byte stream into a dicom-parser DataSet, stopping before pixel data
 *  when `metadataOnly` is set (much faster for the inventory pass). */
export function parseDataSet(bytes: Uint8Array, opts?: { metadataOnly?: boolean }): DataSet {
  const det = detectDicom(bytes);
  if (det.kind === 'not-dicom') {
    throw new MedViewError({
      code: ErrorCode.DICOM_PARSE_FAILED,
      message: 'This file is not a DICOM object.',
      detail: det.reason,
    });
  }
  try {
    return dicomParser.parseDicom(bytes, opts?.metadataOnly ? { untilTag: T.PixelData } : undefined);
  } catch (e) {
    throw new MedViewError({
      code: ErrorCode.DICOM_PARSE_FAILED,
      message: 'This DICOM file could not be parsed and has been excluded.',
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}

/* ---------------------------------------------------------------- accessors */

export function str(ds: DataSet, tag: string): string | undefined {
  const v = ds.string(tag);
  return v === undefined || v === null || v === '' ? undefined : v.trim();
}

export function num(ds: DataSet, tag: string): number | undefined {
  const raw = ds.string(tag);
  if (raw === undefined || raw === null || raw.trim() === '') {
    // Binary VRs (US/UL/SS/SL) are not exposed through .string()
    const el = ds.elements[tag];
    if (!el) return undefined;
    if (el.length === 2) return ds.uint16(tag);
    if (el.length === 4) return ds.uint32(tag);
    return undefined;
  }
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function numList(ds: DataSet, tag: string): number[] | undefined {
  const raw = ds.string(tag);
  if (raw === undefined || raw === null || raw.trim() === '') return undefined;
  const parts = raw.split('\\').map((s) => Number.parseFloat(s.trim()));
  return parts.every((n) => Number.isFinite(n)) ? parts : undefined;
}

export function strList(ds: DataSet, tag: string): string[] {
  const raw = ds.string(tag);
  if (!raw) return [];
  return raw.split('\\').map((s) => s.trim()).filter((s) => s.length > 0);
}

/** uint16 that falls back to the string representation (some encoders use IS). */
function u16(ds: DataSet, tag: string, fallback: number): number {
  const el = ds.elements[tag];
  if (el && el.length === 2) {
    const v = ds.uint16(tag);
    if (v !== undefined) return v;
  }
  return num(ds, tag) ?? fallback;
}

/* ---------------------------------------------------------------- extraction */

export function readPixelEncoding(ds: DataSet): PixelEncoding {
  const bitsAllocated = u16(ds, T.BitsAllocated, 16);
  const bitsStored = u16(ds, T.BitsStored, bitsAllocated);
  const highBit = u16(ds, T.HighBit, bitsStored - 1);
  const pr = u16(ds, T.PixelRepresentation, 0) === 1 ? 1 : 0;
  return {
    bitsAllocated,
    bitsStored,
    highBit,
    pixelRepresentation: pr as 0 | 1,
    samplesPerPixel: u16(ds, T.SamplesPerPixel, 1),
    photometricInterpretation: str(ds, T.PhotometricInterpretation) ?? 'MONOCHROME2',
    planarConfiguration: ds.elements[T.PlanarConfiguration] ? u16(ds, T.PlanarConfiguration, 0) : undefined,
  };
}

export function readRescale(ds: DataSet): RescaleInfo {
  const slope = num(ds, T.RescaleSlope);
  const intercept = num(ds, T.RescaleIntercept);
  const padEl = ds.elements[T.PixelPaddingValue];
  let pixelPaddingValue: number | undefined;
  if (padEl) {
    // VR is US or SS depending on PixelRepresentation.
    pixelPaddingValue = u16(ds, T.PixelPaddingValue, NaN);
    if (!Number.isFinite(pixelPaddingValue)) pixelPaddingValue = undefined;
    else if (readPixelEncoding(ds).pixelRepresentation === 1 && pixelPaddingValue > 32767) {
      pixelPaddingValue -= 65536;
    }
  }
  return {
    slope: slope !== undefined && slope !== 0 ? slope : 1,
    intercept: intercept ?? 0,
    rescaleType: str(ds, T.RescaleType),
    pixelPaddingValue,
    pixelPaddingRangeLimit: num(ds, T.PixelPaddingRangeLimit),
  };
}

function triple(list: number[] | undefined): Vec3 | undefined {
  return list && list.length >= 3 ? [list[0], list[1], list[2]] : undefined;
}

/** Extract the (single-frame) metadata record for an instance.
 *  Enhanced multi-frame objects are detected but their per-frame geometry is read
 *  separately by `readEnhancedFrameGeometry`. */
export function readInstanceMeta(
  ds: DataSet, fileId: string, fileSize: number,
): DicomInstanceMeta {
  const iop = numList(ds, T.ImageOrientationPatient);
  const ps = numList(ds, T.PixelSpacing);
  const wc = numList(ds, T.WindowCenter);
  const ww = numList(ds, T.WindowWidth);
  const pixelEl = ds.elements[T.PixelData];

  return {
    fileId,
    fileSize,
    sopClassUID: str(ds, T.SOPClassUID) ?? '',
    sopInstanceUID: str(ds, T.SOPInstanceUID) ?? '',
    transferSyntaxUID: str(ds, T.TransferSyntaxUID) ?? '1.2.840.10008.1.2',
    studyInstanceUID: str(ds, T.StudyInstanceUID) ?? '<missing-study-uid>',
    seriesInstanceUID: str(ds, T.SeriesInstanceUID) ?? '<missing-series-uid>',
    modality: str(ds, T.Modality) ?? '',
    seriesNumber: num(ds, T.SeriesNumber),
    instanceNumber: num(ds, T.InstanceNumber),
    acquisitionNumber: num(ds, T.AcquisitionNumber),
    seriesDescription: str(ds, T.SeriesDescription),
    studyDescription: str(ds, T.StudyDescription),
    imageType: strList(ds, T.ImageType),
    rows: u16(ds, T.Rows, 0),
    columns: u16(ds, T.Columns, 0),
    numberOfFrames: num(ds, T.NumberOfFrames) ?? 1,
    encoding: readPixelEncoding(ds),
    rescale: readRescale(ds),
    windowCenter: wc,
    windowWidth: ww,
    convolutionKernel: str(ds, T.ConvolutionKernel),
    manufacturer: str(ds, T.Manufacturer),
    manufacturerModelName: str(ds, T.ManufacturerModelName),
    kvp: str(ds, T.KVP),
    contrastBolusAgent: str(ds, T.ContrastBolusAgent),
    studyDate: str(ds, T.StudyDate),
    seriesDate: str(ds, T.SeriesDate),
    protocolName: str(ds, T.ProtocolName),
    bodyPartExamined: str(ds, T.BodyPartExamined),
    lossyImageCompression: str(ds, T.LossyImageCompression),
    hasPixelData: Boolean(pixelEl),
    imagePositionPatient: triple(numList(ds, T.ImagePositionPatient)),
    imageOrientationPatient:
      iop && iop.length >= 6 ? [iop[0], iop[1], iop[2], iop[3], iop[4], iop[5]] : undefined,
    pixelSpacing: ps && ps.length >= 2 ? [ps[0], ps[1]] : undefined,
    sliceThickness: num(ds, T.SliceThickness),
    spacingBetweenSlices: num(ds, T.SpacingBetweenSlices),
    sliceLocation: num(ds, T.SliceLocation),
    frameOfReferenceUID: str(ds, T.FrameOfReferenceUID),
    patientPosition: str(ds, T.PatientPosition),
    gantryDetectorTilt: num(ds, T.GantryDetectorTilt),
  };
}

/** Patient-identifying header fields, read only when the user explicitly asks for a
 *  burned-in annotation or an export. Never logged (§40). */
export interface PatientHeader {
  patientName?: string;
  patientID?: string;
  patientSex?: string;
  patientAge?: string;
  studyDate?: string;
  studyDescription?: string;
  institutionName?: string;
}

export function readPatientHeader(ds: DataSet): PatientHeader {
  return {
    patientName: str(ds, T.PatientName),
    patientID: str(ds, T.PatientID),
    patientSex: str(ds, T.PatientSex),
    patientAge: str(ds, T.PatientAge),
    studyDate: str(ds, T.StudyDate),
    studyDescription: str(ds, T.StudyDescription),
    institutionName: str(ds, T.InstitutionName),
  };
}
