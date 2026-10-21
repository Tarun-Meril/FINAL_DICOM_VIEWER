/**
 * Cornerstone metadata provider fed from OUR validated geometry.
 *
 * The rendering engine never re-derives geometry from the raw files. It asks
 * this provider, which answers from the FrameDescriptor set that already
 * passed DICOMGeometry validation. One geometry source, one set of
 * assumptions, no opportunity for the renderer and the measurement layer to
 * disagree.
 */

import { metaData } from '@cornerstonejs/core';
import type { FrameDescriptor } from '../core/geometry/types';
import type { PatientStudyInfo } from '../dicom/parseFrames';

const frames = new Map<string, FrameDescriptor>();
const studyInfo = new Map<string, PatientStudyInfo>();

export function registerFrames(list: readonly FrameDescriptor[]): void {
  for (const f of list) {
    frames.set(f.id, f);
    if (!f.id.startsWith('cornerstoneStreamingImageVolume:')) {
      frames.set(`cornerstoneStreamingImageVolume:${f.id}`, f);
    }
  }
}

export function registerStudyInfo(imageId: string, info: PatientStudyInfo): void {
  studyInfo.set(imageId, info);
  if (!imageId.startsWith('cornerstoneStreamingImageVolume:')) {
    studyInfo.set(`cornerstoneStreamingImageVolume:${imageId}`, info);
  }
}

export function getFrame(imageId: string): FrameDescriptor | undefined {
  if (!imageId) return undefined;
  let f = frames.get(imageId);
  if (!f) {
    const stripped = imageId.replace(/^cornerstoneStreamingImageVolume:/, '');
    f = frames.get(stripped);
  }
  if (!f && imageId.includes('?')) {
    f = frames.get(imageId.split('?')[0]);
  }
  return f;
}

export function clearRegistry(): void {
  frames.clear();
  studyInfo.clear();
}

export function mprMetadataProvider(type: string, imageId: string): unknown {
  if (!imageId) return undefined;
  let f = frames.get(imageId);
  if (!f) {
    const stripped = imageId.replace(/^cornerstoneStreamingImageVolume:/, '');
    f = frames.get(stripped);
  }
  if (!f && imageId.includes('?')) {
    f = frames.get(imageId.split('?')[0]);
  }
  if (!f) return undefined;

  switch (type) {
    case 'imagePlaneModule':
      return {
        frameOfReferenceUID: f.frameOfReferenceUID,
        rows: f.rows,
        columns: f.columns,
        imageOrientationPatient: [...f.imageOrientationPatient],
        rowCosines: [
          f.imageOrientationPatient[0],
          f.imageOrientationPatient[1],
          f.imageOrientationPatient[2],
        ],
        columnCosines: [
          f.imageOrientationPatient[3],
          f.imageOrientationPatient[4],
          f.imageOrientationPatient[5],
        ],
        imagePositionPatient: [...f.imagePositionPatient],
        sliceThickness: f.sliceThickness,
        sliceLocation: f.sliceLocation,
        // Pixel Spacing is [row spacing, column spacing]; Cornerstone wants the
        // two named separately, which removes the usual source of transposed
        // spacing bugs.
        pixelSpacing: [...f.pixelSpacing],
        rowPixelSpacing: f.pixelSpacing[0],
        columnPixelSpacing: f.pixelSpacing[1],
        spacingBetweenSlices: f.spacingBetweenSlices,
        usingDefaultValues: false,
      };

    case 'imagePixelModule':
      return {
        rows: f.rows,
        columns: f.columns,
        samplesPerPixel: f.samplesPerPixel ?? 1,
        photometricInterpretation: f.photometricInterpretation ?? 'MONOCHROME2',
        // The volume loader allocates its typed array from these; omitting
        // them is what produces the "Bits allocated of undefined" failure.
        bitsAllocated: f.bitsAllocated ?? 16,
        bitsStored: f.bitsStored ?? f.bitsAllocated ?? 16,
        highBit: f.highBit ?? (f.bitsStored ?? 16) - 1,
        pixelRepresentation: f.pixelRepresentation ?? 0,
        planarConfiguration: f.planarConfiguration ?? 0,
        smallestPixelValue: undefined,
        largestPixelValue: undefined,
      };

    case 'modalityLutModule':
    case 'modalityLUTModule':
      return {
        rescaleSlope: f.rescaleSlope ?? 1,
        rescaleIntercept: f.rescaleIntercept ?? (f.modality === 'CT' ? -1024 : 0),
        rescaleType: f.modality === 'CT' ? 'HU' : 'US',
      };

    case 'voiLutModule':
    case 'voiLUTModule':
      return {
        windowCenter: f.windowCenter !== undefined ? [f.windowCenter] : [40],
        windowWidth: f.windowWidth !== undefined ? [f.windowWidth] : [400],
      };

    case 'generalSeriesModule':
      return {
        modality: f.modality,
        seriesInstanceUID: f.seriesInstanceUID,
        seriesNumber: f.seriesNumber,
        seriesDescription: f.seriesDescription,
        studyInstanceUID: f.studyInstanceUID,
        frameOfReferenceUID: f.frameOfReferenceUID,
      };

    case 'generalImageModule':
      return {
        sopInstanceUID: f.sopInstanceUID,
        instanceNumber: f.instanceNumber,
        imageType: f.imageType,
      };

    case 'sopCommonModule':
      return {
        sopClassUID: f.sopClassUID,
        sopInstanceUID: f.sopInstanceUID,
      };

    case 'patientStudyModule': {
      const stripped = imageId.replace(/^cornerstoneStreamingImageVolume:/, '');
      const info = studyInfo.get(imageId) || studyInfo.get(stripped);
      return info
        ? {
            patientName: info.patientName,
            patientId: info.patientId,
            patientSex: info.patientSex,
            patientBirthDate: info.patientBirthDate,
            studyDate: info.studyDate,
            studyTime: info.studyTime,
            studyDescription: info.studyDescription,
          }
        : undefined;
    }

    default:
      return undefined;
  }
}

let registered = false;
export function installMetadataProvider(): void {
  if (registered) return;
  // High priority so our validated geometry wins over the loader's own guess.
  metaData.addProvider(mprMetadataProvider as never, 10000);
  registered = true;
}
