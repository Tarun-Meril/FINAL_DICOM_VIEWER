import fs from 'fs';
import dicomParser from 'dicom-parser';

export interface DicomMetadata {
  patientName: string;
  patientId: string;
  patientBirthDate: string;
  patientSex: string;
  studyDate: string;
  studyTime: string;
  accessionNumber: string;
  studyDescription: string;
  studyInstanceUid: string;
  seriesInstanceUid: string;
  sopInstanceUid: string;
  modality: string;
  seriesNumber: number;
  instanceNumber: number;
  
  // Phase 3 tags
  manufacturer: string;
  institution: string;
  bodyPart: string;
  sliceThickness: number;
  pixelSpacing: number[];
  imageOrientation: number[];
  imagePosition: number[];
  rows: number;
  columns: number;
  bitsAllocated: number;
  bitsStored: number;
  transferSyntaxUid: string;
  windowCenter: number;
  windowWidth: number;
  rescaleIntercept: number;
  rescaleSlope: number;
  photometricInterpretation: string;
  numberOfFrames: number;
  frameIncrementPointer: string;
  pixelRepresentation: number;
  
  // Computed values
  sliceDistance?: number;
}

export class DicomService {
  
  public static findTransferSyntax(buffer: Buffer): string {
    try {
      // Transfer Syntax UID tag is (0002, 0010) -> bytes 02 00 10 00 in Little Endian
      const tag = Buffer.from([0x02, 0x00, 0x10, 0x00]);
      const index = buffer.indexOf(tag);
      if (index !== -1 && index < 3000) {
        const vr = buffer.toString('ascii', index + 4, index + 6);
        if (vr === 'UI') {
          const length = buffer.readUInt16LE(index + 6);
          return buffer.toString('ascii', index + 8, index + 8 + length).replace(/\0/g, '').trim();
        } else {
          // Implicit VR (4 bytes length)
          const length = buffer.readUInt32LE(index + 4);
          return buffer.toString('ascii', index + 8, index + 8 + length).replace(/\0/g, '').trim();
        }
      }
    } catch (e) {
      console.error('Failed to search binary buffer for transfer syntax:', e);
    }
    return '1.2.840.10008.1.2.1'; // Fallback to Explicit VR Little Endian
  }

  public static parseFile(filePath: string): DicomMetadata {
    const buffer = fs.readFileSync(filePath);
    const dataset = dicomParser.parseDicom(buffer);

    const getString = (tag: string) => {
      try {
        return dataset.string(tag) || '';
      } catch {
        return '';
      }
    };

    const getFloat = (tag: string, defaultVal = 0) => {
      try {
        const val = dataset.string(tag);
        return val ? parseFloat(val) : defaultVal;
      } catch {
        return defaultVal;
      }
    };

    const getInt = (tag: string, defaultVal = 0) => {
      try {
        const val = dataset.string(tag);
        return val ? parseInt(val, 10) : defaultVal;
      } catch {
        return defaultVal;
      }
    };

    const getFloatArray = (tag: string): number[] => {
      try {
        const val = dataset.string(tag);
        return val ? val.split('\\').map(parseFloat) : [];
      } catch {
        return [];
      }
    };

    const getUInt16 = (tag: string, defaultVal = 0) => {
      try {
        return dataset.uint16(tag) ?? defaultVal;
      } catch {
        return defaultVal;
      }
    };

    // Patient Name is often formatted as SURNAME^FIRSTNAME
    let rawPatientName = getString('x00100010');
    let patientName = rawPatientName.replace(/\^/g, ' ').trim();
    if (!patientName) patientName = 'Anonymous';

    const patientId = getString('x00100020') || 'NO_ID';
    const patientBirthDate = getString('x00100030');
    const patientSex = getString('x00100040') || 'O';
    const studyDate = getString('x00080020');
    const studyTime = getString('x00080030');
    const accessionNumber = getString('x00080050') || 'NO_ACCESSION';
    const studyDescription = getString('x00081030') || 'No Description';
    const studyInstanceUid = getString('x0020000d');
    const seriesInstanceUid = getString('x0020000e');
    const sopInstanceUid = getString('x00080018');
    const modality = getString('x00080060') || 'OT';
    
    const rawSeriesNum = getString('x00200011');
    const seriesNumber = rawSeriesNum ? parseInt(rawSeriesNum, 10) : 1;

    const rawInstNum = getString('x00200013');
    const instanceNumber = rawInstNum ? parseInt(rawInstNum, 10) : 1;

    if (!studyInstanceUid || !seriesInstanceUid || !sopInstanceUid) {
      throw new Error('Invalid DICOM file: Missing critical UIDs.');
    }

    // Phase 3 Tags
    const manufacturer = getString('x00080070') || 'Generic';
    const institution = getString('x00080080') || 'Local Clinic';
    const bodyPart = getString('x00180015') || 'UNKNOWN';
    const sliceThickness = getFloat('x00180050', 0);
    const pixelSpacing = getFloatArray('x00280030');
    const imageOrientation = getFloatArray('x00200037');
    const imagePosition = getFloatArray('x00200032');
    const rows = getUInt16('x00280010', 0);
    const columns = getUInt16('x00280011', 0);
    const bitsAllocated = getUInt16('x00280100', 16);
    const bitsStored = getUInt16('x00280101', 12);
    
    let transferSyntaxUid = getString('x00020010');
    if (!transferSyntaxUid) {
      transferSyntaxUid = DicomService.findTransferSyntax(buffer);
    }
    
    const windowCenter = getFloat('x00281050', 40);
    const windowWidth = getFloat('x00281051', 400);
    const rescaleIntercept = getFloat('x00281052', 0);
    const rescaleSlope = getFloat('x00281053', 1);
    const photometricInterpretation = getString('x00280004') || 'MONOCHROME2';
    const numberOfFrames = getInt('x00280008', 1);
    const frameIncrementPointer = getString('x00280009');
    const pixelRepresentation = getUInt16('x00280103', 0);

    // Compute slice distance along the orientation plane normal vector
    let sliceDistance: number | undefined = undefined;
    if (imageOrientation.length === 6 && imagePosition.length === 3) {
      const rx = imageOrientation[0], ry = imageOrientation[1], rz = imageOrientation[2];
      const cx = imageOrientation[3], cy = imageOrientation[4], cz = imageOrientation[5];
      // cross product row x col
      const nx = ry * cz - rz * cy;
      const ny = rz * cx - rx * cz;
      const nz = rx * cy - ry * cx;
      sliceDistance = imagePosition[0] * nx + imagePosition[1] * ny + imagePosition[2] * nz;
    }

    return {
      patientName,
      patientId,
      patientBirthDate,
      patientSex,
      studyDate,
      studyTime,
      accessionNumber,
      studyDescription,
      studyInstanceUid,
      seriesInstanceUid,
      sopInstanceUid,
      modality,
      seriesNumber,
      instanceNumber,
      manufacturer,
      institution,
      bodyPart,
      sliceThickness,
      pixelSpacing,
      imageOrientation,
      imagePosition,
      rows,
      columns,
      bitsAllocated,
      bitsStored,
      transferSyntaxUid,
      windowCenter,
      windowWidth,
      rescaleIntercept,
      rescaleSlope,
      photometricInterpretation,
      numberOfFrames,
      frameIncrementPointer,
      pixelRepresentation,
      sliceDistance
    };
  }
}
