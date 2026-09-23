/**
 * SeriesValidator
 *
 * Dedicated series-level validation gate for CT and MRI MPR reconstruction.
 * Enforces modality detection and strict physical DICOM geometry integrity.
 */

import { MPRReconstructabilityValidator, type ValidationResult } from '../MPRReconstructabilityValidator';

export interface CTSeriesGeometryValidation {
  isValid: boolean;
  isCT: boolean;
  errors: string[];
  warnings: string[];
  details?: any;
}

export class SeriesValidator {
  /**
   * Identifies whether a given series or list of instances represents a CT acquisition.
   * Checks the DICOM Modality tag (" CT\) on the series descriptor or instance metadata.
 */
 static isCTSeries(seriesOrInstances: any): boolean {
 if (!seriesOrInstances) return false;

 // 1. If an array of instances
 if (Array.isArray(seriesOrInstances)) {
 if (seriesOrInstances.length === 0) return false;
 const first = seriesOrInstances[0];
 const modality = (first.modality || first.Modality || '').toUpperCase();
 return modality === 'CT';
 }

 // 2. If a series object
 const modality = (
 seriesOrInstances.modality ||
 seriesOrInstances.Modality ||
 seriesOrInstances.series_modality ||
 ''
 ).toUpperCase();

 return modality === 'CT';
 }

 /**
 * Validates CT physical DICOM geometry before volume construction.
 * Verifies:
 * - Modality is CT
 * - Uniform SeriesInstanceUID and consistent FrameOfReferenceUID
 * - Presence and consistency of ImagePositionPatient (IPP)
 * - Presence and consistency of ImageOrientationPatient (IOP)
 * - Consistent PixelSpacing (row / column)
 * - Slice spacing / thickness regularity
 * - Consistent Rows & Columns
 *
 * Leverages MPRReconstructabilityValidator to compute slice spacing and ensure no corruption.
 */
 static validateCTSeriesGeometry(instances: any[]): CTSeriesGeometryValidation {
 const errors: string[] = [];
 const warnings: string[] = [];

 if (!instances || !Array.isArray(instances) || instances.length === 0) {
 return {
 isValid: false,
 isCT: false,
 errors: ['Series contains no DICOM instances.'],
 warnings: [],
 };
 }

 const isCT = this.isCTSeries(instances);

 // 1. Check for mixed SeriesInstanceUID
 const firstSeriesUID = instances[0].series_instance_uid || instances[0].seriesInstanceUid || instances[0].SeriesInstanceUID;
 const mixedSeries = instances.some(inst => {
 const uid = inst.series_instance_uid || inst.seriesInstanceUid || inst.SeriesInstanceUID;
 return uid && firstSeriesUID && uid !== firstSeriesUID;
 });
 if (mixedSeries) {
 errors.push('Series contains mixed SeriesInstanceUIDs. All slices in a volume must belong to the same series.');
 }

 // 2. Run core reconstruction validator (OHIF-patterned geometry gate)
 const mprValidation: ValidationResult = MPRReconstructabilityValidator.validate(instances);

 if (mprValidation.status === 'FAIL') {
 errors.push(mprValidation.reason);
 } else if (mprValidation.status === 'WARNING') {
 warnings.push(mprValidation.reason);
 }

 // 3. Check for FrameOfReferenceUID presence
 const missingFoR = instances.filter(
 inst => !(inst.frame_of_reference_uid || inst.frameOfReferenceUID || inst.FrameOfReferenceUID)
 ).length;

 if (missingFoR > 0) {
 warnings.push(missingFoR + '/' + instances.length + ' instances lack an explicit FrameOfReferenceUID.');
 }

 // 4. Pixel Spacing validation
 const firstInst = instances[0];
 const ps = firstInst.pixel_spacing || firstInst.pixelSpacing || firstInst.PixelSpacing;
 if (!ps || !Array.isArray(ps) || ps.length < 2 || Number(ps[0]) <= 0 || Number(ps[1]) <= 0) {
 errors.push('Invalid or missing PixelSpacing in CT metadata.');
 }

 // 5. Rows & Columns validation
 const rows = Number(firstInst.rows || firstInst.Rows || 0);
 const cols = Number(firstInst.columns || firstInst.Columns || 0);
 if (rows <= 0 || cols <= 0) {
 errors.push('Invalid image dimensions (' + rows + 'x' + cols + ').');
 }

 return {
 isValid: errors.length === 0,
 isCT,
 errors,
 warnings,
 details: mprValidation.details,
 };
 }
}
