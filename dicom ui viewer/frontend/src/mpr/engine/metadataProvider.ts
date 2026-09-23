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
  for (const f of list) frames.set(f.id, f);
}

export function registerStudyInfo(imageId: string, info: PatientStudyInfo): void {
  studyInfo.set(imageId, info);
}

export function getFrame(imageId: string): FrameDescriptor | undefined {
  return frames.get(imageId);
}

export function clearRegistry(): void {
  frames.clear();
  studyInfo.clear();
}

export function mprMetadataProvider(type: string, imageId: string): unknown {
  const f = frames.get(imageId);
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
      return {
        rescaleSlope: f.rescaleSlope ?? 1,
        rescaleIntercept: f.rescaleIntercept ?? 0,
        rescaleType: f.modality === 'CT' ? 'HU' : 'US',
      };

    case 'voiLutModule':
      return {
        windowCenter: f.windowCenter !== undefined ? [f.windowCenter] : [],
        windowWidth: f.windowWidth !== undefined ? [f.windowWidth] : [],
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
      const info = studyInfo.get(imageId);
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
