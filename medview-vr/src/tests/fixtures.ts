import type { DicomInstanceMeta } from '@/dicom/types';

let uid = 0;
export function makeInstance(overrides: Partial<DicomInstanceMeta> = {}): DicomInstanceMeta {
  return {
    fileId: `file-${uid++}`,
    fileSize: 1024,
    sopClassUID: '1.2.840.10008.5.1.4.1.1.2',
    sopInstanceUID: `1.2.3.${uid}`,
    transferSyntaxUID: '1.2.840.10008.1.2.1',
    studyInstanceUID: '1.2.3.study',
    seriesInstanceUID: '1.2.3.series',
    modality: 'CT',
    seriesNumber: 1,
    instanceNumber: uid,
    imageType: ['ORIGINAL', 'PRIMARY', 'AXIAL'],
    rows: 8,
    columns: 8,
    numberOfFrames: 1,
    encoding: {
      bitsAllocated: 16, bitsStored: 12, highBit: 11, pixelRepresentation: 0,
      samplesPerPixel: 1, photometricInterpretation: 'MONOCHROME2',
    },
    rescale: { slope: 1, intercept: -1024 },
    hasPixelData: true,
    imagePositionPatient: [0, 0, 0],
    imageOrientationPatient: [1, 0, 0, 0, 1, 0],
    pixelSpacing: [0.5, 0.5],
    sliceThickness: 1,
    frameOfReferenceUID: '1.2.3.for',
    patientPosition: 'HFS',
    ...overrides,
  };
}

/** An axial stack at the given slice coordinates (mm along +z). */
export function axialStack(zs: number[], overrides: Partial<DicomInstanceMeta> = {}): DicomInstanceMeta[] {
  return zs.map((z, i) => makeInstance({
    ...overrides,
    instanceNumber: i + 1,
    imagePositionPatient: [-10, -20, z],
  }));
}
