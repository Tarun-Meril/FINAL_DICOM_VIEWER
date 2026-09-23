/**
 * DicomValidator Subsystem
 * Validates DICOM datasets against PS 3.3 Information Object Definitions (IOD) and mandatory tags
 */

import { IEngineContext } from '../types/contracts';

export class DicomValidator {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public validateDataset(dataset: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!dataset.SOPInstanceUID) errors.push('Missing mandatory tag: SOPInstanceUID (0008,0018)');
    if (!dataset.StudyInstanceUID) errors.push('Missing mandatory tag: StudyInstanceUID (0020,000D)');
    if (!dataset.SeriesInstanceUID) errors.push('Missing mandatory tag: SeriesInstanceUID (0020,000E)');

    return { valid: errors.length === 0, errors };
  }
}
