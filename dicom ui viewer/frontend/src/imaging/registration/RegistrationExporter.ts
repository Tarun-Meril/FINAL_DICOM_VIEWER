/**
 * RegistrationExporter Subsystem
 * Exports Spatial Registration matrices to DICOM Spatial Registration Storage format
 */

import { IRegistrationTransform } from '../types/contracts';

export class RegistrationExporter {
  public static exportToJson(transform: IRegistrationTransform): string {
    return JSON.stringify({ timestamp: new Date().toISOString(), transform }, null, 2);
  }
}
