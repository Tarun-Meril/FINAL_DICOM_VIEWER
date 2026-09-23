/**
 * ConformanceManager Subsystem
 * DICOM Conformance Statement manager for Storage SCP/SCU, Q/R, MWL, MPPS, DICOMweb, RTSTRUCT, SEG, SR
 */

import { IEngineContext } from '../types/contracts';

export class ConformanceManager {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public getSupportedSOPClasses(): string[] {
    return [
      '1.2.840.10008.5.1.4.1.1.2', // CT Image Storage
      '1.2.840.10008.5.1.4.1.1.4', // MR Image Storage
      '1.2.840.10008.5.1.4.1.1.66.4', // Segmentation Storage
      '1.2.840.10008.5.1.4.1.1.481.3', // RT Struct Storage
      '1.2.840.10008.5.1.4.1.1.88.33', // Comprehensive SR Storage
    ];
  }
}
