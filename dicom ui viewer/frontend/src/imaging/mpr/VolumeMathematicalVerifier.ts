import { Logger, LogCategory } from '../shared/Logger';
import { MPRReconstructabilityValidator } from './MPRReconstructabilityValidator';

export interface VolumeMathematicalReport {
  seriesUID: string;
  sliceCount: number;
  rows: number;
  columns: number;
  voxelSpacing: [number, number, number]; // X, Y, Z
  volumeDimensions: [number, number, number]; // X, Y, Z
  imageOrientationPatient: number[];
  sliceNormal: number[];
  volumeOrigin: number[];
  directionMatrix: number[];
  physicalBounds: {
    x: [number, number];
    y: [number, number];
    z: [number, number];
  };
  pixelRepresentation: number;
  bitsAllocated: number;
  bitsStored: number;
  rescaleSlope: number;
  rescaleIntercept: number;
  geometryClassification: string;
}

export class VolumeMathematicalVerifier {
  static verify(instances: any[]): VolumeMathematicalReport | null {
    if (!instances || instances.length < 2) {
      Logger.error(LogCategory.GENERAL, '[VolumeVerifier] Insufficient slices for volume verification.');
      return null;
    }

    const firstInst = instances[0];
    const seriesUID = firstInst.series_instance_uid || firstInst.seriesInstanceUid || firstInst.SeriesInstanceUID || 'UNKNOWN';
    
    // Sort instances by physical position to find true volume bounds
    const sortedInstances = MPRReconstructabilityValidator.sortByIPP(instances);
    const originInst = sortedInstances[0];
    
    const rows = Number(firstInst.rows || firstInst.Rows || 0);
    const columns = Number(firstInst.columns || firstInst.Columns || 0);
    const cols = columns;

    const ps = firstInst.pixel_spacing || firstInst.pixelSpacing || firstInst.PixelSpacing;
    const spacingX = ps && ps.length >= 2 ? Number(ps[0]) : 1.0;
    const spacingY = ps && ps.length >= 2 ? Number(ps[1]) : 1.0;
    
    const spacingZ = MPRReconstructabilityValidator.computeZSpacingMm(sortedInstances) || 1.0;
    const voxelSpacing: [number, number, number] = [spacingX, spacingY, spacingZ];

    // Evaluate IOP
    let rawIop = firstInst.image_orientation || firstInst.imageOrientationPatient || firstInst.ImageOrientationPatient;
    if (typeof rawIop === 'string') rawIop = rawIop.split('\\').map(Number);
    const iop = Array.isArray(rawIop) && rawIop.length === 6 ? rawIop.map(Number) : [1, 0, 0, 0, 1, 0];
    
    const rowCos = [iop[0], iop[1], iop[2]];
    const colCos = [iop[3], iop[4], iop[5]];
    
    // Cross product
    const sliceNormal = [
      rowCos[1] * colCos[2] - rowCos[2] * colCos[1],
      rowCos[2] * colCos[0] - rowCos[0] * colCos[2],
      rowCos[0] * colCos[1] - rowCos[1] * colCos[0]
    ];

    const directionMatrix = [
      rowCos[0], rowCos[1], rowCos[2],
      colCos[0], colCos[1], colCos[2],
      sliceNormal[0], sliceNormal[1], sliceNormal[2]
    ];

    let rawIpp = originInst.image_position || originInst.imagePositionPatient || originInst.ImagePositionPatient;
    if (typeof rawIpp === 'string') rawIpp = rawIpp.split('\\').map(Number);
    const volumeOrigin = Array.isArray(rawIpp) && rawIpp.length === 3 ? rawIpp.map(Number) : [0, 0, 0];

    // Dimensions: (Columns, Rows, Slices) in patient coordinate space mapping?
    // Often X=cols, Y=rows, Z=slices
    const uniqueInstances = MPRReconstructabilityValidator.filterTemporalPhases(sortedInstances);
    const volumeDimensions: [number, number, number] = [cols, rows, uniqueInstances.length];

    // Compute Physical Bounds
    // Bound vectors: origin + (X * spacingX * rowCos) + (Y * spacingY * colCos) + (Z * spacingZ * sliceNormal)
    const boundsX = [
      volumeOrigin[0],
      volumeOrigin[0] + (cols * spacingX * rowCos[0]) + (rows * spacingY * colCos[0]) + (uniqueInstances.length * spacingZ * sliceNormal[0])
    ];
    const boundsY = [
      volumeOrigin[1],
      volumeOrigin[1] + (cols * spacingX * rowCos[1]) + (rows * spacingY * colCos[1]) + (uniqueInstances.length * spacingZ * sliceNormal[1])
    ];
    const boundsZ = [
      volumeOrigin[2],
      volumeOrigin[2] + (cols * spacingX * rowCos[2]) + (rows * spacingY * colCos[2]) + (uniqueInstances.length * spacingZ * sliceNormal[2])
    ];

    const physicalBounds = {
      x: [Math.min(...boundsX), Math.max(...boundsX)] as [number, number],
      y: [Math.min(...boundsY), Math.max(...boundsY)] as [number, number],
      z: [Math.min(...boundsZ), Math.max(...boundsZ)] as [number, number]
    };

    // Pixel Data types
    const pixelRepresentation = Number(firstInst.pixel_representation || firstInst.pixelRepresentation || firstInst.PixelRepresentation || 0);
    const bitsAllocated = Number(firstInst.bits_allocated || firstInst.bitsAllocated || firstInst.BitsAllocated || 16);
    const bitsStored = Number(firstInst.bits_stored || firstInst.bitsStored || firstInst.BitsStored || 16);
    const rescaleSlope = Number(firstInst.rescale_slope || firstInst.rescaleSlope || firstInst.RescaleSlope || 1);
    const rescaleIntercept = Number(firstInst.rescale_intercept || firstInst.rescaleIntercept || firstInst.RescaleIntercept || 0);

    // Get Geometry classification from the Validator
    const validationResult = MPRReconstructabilityValidator.validate(sortedInstances);
    
    // Convert status/reason to the specific classifications required by the plan
    let geometryClassification = 'VALID_UNIFORM';
    if (validationResult.status === 'FAIL') {
      if (validationResult.reason.includes('ImageOrientationPatient inconsistency')) geometryClassification = 'INCONSISTENT_ORIENTATION';
      else if (validationResult.reason.includes('Row count mismatch') || validationResult.reason.includes('Column count mismatch')) geometryClassification = 'INCONSISTENT_DIMENSIONS';
      else if (validationResult.reason.includes('ImagePositionPatient')) geometryClassification = 'UNSUPPORTED_GEOMETRY';
      else if (validationResult.reason.includes('mixed orientations')) geometryClassification = 'MULTIPLE_SERIES';
      else geometryClassification = 'UNSUPPORTED_GEOMETRY';
    } else if (validationResult.status === 'WARNING') {
      if (validationResult.reason.includes('Irregular slice spacing detected')) geometryClassification = 'NON_UNIFORM_SPACING';
      else if (validationResult.reason.includes('mixed orientations')) geometryClassification = 'MULTIPLE_SERIES';
      else if (validationResult.reason.includes('Minor spacing irregularity')) geometryClassification = 'VALID_WITH_FLOATING_POINT_TOLERANCE';
      else geometryClassification = 'VALID_WITH_FLOATING_POINT_TOLERANCE';
    } else {
      geometryClassification = 'VALID_UNIFORM'; // Passing
      // We should check for duplicate slices or reversed order
      const inst0 = Number(sortedInstances[0].instance_number || sortedInstances[0].InstanceNumber);
      const instLast = Number(sortedInstances[sortedInstances.length-1].instance_number || sortedInstances[sortedInstances.length-1].InstanceNumber);
      if (!isNaN(inst0) && !isNaN(instLast) && inst0 > instLast) {
        geometryClassification = 'REVERSED_ORDER';
      }
    }

    const report: VolumeMathematicalReport = {
      seriesUID,
      sliceCount: uniqueInstances.length,
      rows,
      columns,
      voxelSpacing,
      volumeDimensions,
      imageOrientationPatient: iop,
      sliceNormal,
      volumeOrigin,
      directionMatrix,
      physicalBounds,
      pixelRepresentation,
      bitsAllocated,
      bitsStored,
      rescaleSlope,
      rescaleIntercept,
      geometryClassification
    };

    this.logReport(report);
    return report;
  }

  private static logReport(report: VolumeMathematicalReport) {
    Logger.info(LogCategory.GENERAL, `[VolumeVerifier] Mathematical Volume Verification Report:`);
    Logger.info(LogCategory.GENERAL, JSON.stringify(report, null, 2));
  }
}
