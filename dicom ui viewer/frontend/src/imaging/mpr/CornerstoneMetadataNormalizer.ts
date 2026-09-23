/**
 * CornerstoneMetadataNormalizer
 * 
 * Normalizes backend DICOM JSON metadata into the strictly typed format
 * expected by Cornerstone3D's volume loader and metadata providers.
 */

function parseNumber(val: any, defaultVal: number): number {
  if (val == null) return defaultVal;
  if (Array.isArray(val)) return Number(val[0]) || defaultVal;
  if (typeof val === 'string') return Number(val.split('\\')[0]) || defaultVal;
  return Number(val) || defaultVal;
}

function parseNumberArray(val: any, defaultVal: number[] | null): number[] | null {
  if (val == null) return defaultVal;
  if (Array.isArray(val)) return val.map(Number);
  if (typeof val === 'string') return val.split('\\').map(Number);
  return defaultVal;
}

export class CornerstoneMetadataNormalizer {
  static normalize(inst: any, idx: number, computedSpacingMm?: number | null): any {
    // 1. IPP
    let rawIpp = inst.image_position || inst.imagePositionPatient || inst.ImagePositionPatient;
    const ipp = parseNumberArray(rawIpp, null);

    // 2. IOP
    let rawIop = inst.image_orientation || inst.imageOrientationPatient || inst.ImageOrientationPatient;
    const iop = parseNumberArray(rawIop, [1, 0, 0, 0, 1, 0]);

    // 3. PixelSpacing
    let rawPs = inst.pixel_spacing || inst.pixelSpacing || inst.PixelSpacing;
    const ps = parseNumberArray(rawPs, [1.0, 1.0]);

    // Priority: computedSpacingMm -> SpacingBetweenSlices -> SliceThickness
    const explicitSpacing = parseNumber(inst.spacing_between_slices ?? inst.spacingBetweenSlices ?? inst.SpacingBetweenSlices, -1);
    const sliceThickness = parseNumber(inst.slice_thickness ?? inst.sliceThickness ?? inst.SliceThickness, 1.25);
    let spacingBetweenSlices = explicitSpacing > 0 ? explicitSpacing : sliceThickness;
    if (computedSpacingMm != null && computedSpacingMm > 0) {
      spacingBetweenSlices = computedSpacingMm;
    }

    // 5. UIDs
    const sopUid = inst.sop_instance_uid || inst.sopInstanceUid || inst.SOPInstanceUID || `synthetic-sop-${idx}`;
    const seriesUid = inst.series_instance_uid || inst.seriesInstanceUid || inst.SeriesInstanceUID || '1.2.840.10008.1.1';
    const studyUid = inst.study_instance_uid || inst.studyInstanceUid || inst.StudyInstanceUID || '1.2.840.10008.1.2';
    
    // Crucial for 3D Volume
    const forUID = inst.frame_of_reference_uid || inst.frameOfReferenceUID || inst.FrameOfReferenceUID || seriesUid;

    const modality = inst.modality || inst.Modality || 'MR';

    const result: any = {
      ...inst, // Preserve anything else
      
      // Enforce strict Cornerstone casing
      Columns: parseNumber(inst.columns || inst.Columns, 512),
      Rows: parseNumber(inst.rows || inst.Rows, 512),
      columns: parseNumber(inst.columns || inst.Columns, 512),
      rows: parseNumber(inst.rows || inst.Rows, 512),
      
      ImageOrientationPatient: iop,
      imageOrientationPatient: iop,
      ImagePositionPatient: ipp, // This could be null, which is correct (triggers validation failure instead of fake geometry)
      imagePositionPatient: ipp,
      
      PixelSpacing: ps,
      pixelSpacing: ps,
      SliceThickness: sliceThickness,
      sliceThickness: sliceThickness,
      SpacingBetweenSlices: spacingBetweenSlices,
      spacingBetweenSlices: spacingBetweenSlices,
      
      FrameOfReferenceUID: forUID,
      frameOfReferenceUID: forUID,
      SOPInstanceUID: sopUid,
      sopInstanceUID: sopUid,
      SeriesInstanceUID: seriesUid,
      seriesInstanceUID: seriesUid,
      StudyInstanceUID: studyUid,
      studyInstanceUID: studyUid,
      
      Modality: modality,
      modality: modality,
      
      BitsAllocated: parseNumber(inst.bits_allocated || inst.bitsAllocated || inst.BitsAllocated, 16),
      bitsAllocated: parseNumber(inst.bits_allocated || inst.bitsAllocated || inst.BitsAllocated, 16),
      BitsStored: parseNumber(inst.bits_stored || inst.bitsStored || inst.BitsStored, 12),
      bitsStored: parseNumber(inst.bits_stored || inst.bitsStored || inst.BitsStored, 12),
      HighBit: parseNumber(inst.high_bit || inst.highBit || inst.HighBit, 11),
      highBit: parseNumber(inst.high_bit || inst.highBit || inst.HighBit, 11),
      PixelRepresentation: parseNumber(inst.pixel_representation ?? inst.pixelRepresentation ?? inst.PixelRepresentation, 0),
      pixelRepresentation: parseNumber(inst.pixel_representation ?? inst.pixelRepresentation ?? inst.PixelRepresentation, 0),
      PhotometricInterpretation: inst.photometric_interpretation || inst.photometricInterpretation || inst.PhotometricInterpretation || 'MONOCHROME2',
      photometricInterpretation: inst.photometric_interpretation || inst.photometricInterpretation || inst.PhotometricInterpretation || 'MONOCHROME2',
      RescaleIntercept: modality === 'MR' ? 0 : parseNumber(inst.rescale_intercept ?? inst.rescaleIntercept ?? inst.RescaleIntercept, 0),
      rescaleIntercept: modality === 'MR' ? 0 : parseNumber(inst.rescale_intercept ?? inst.rescaleIntercept ?? inst.RescaleIntercept, 0),
      RescaleSlope: modality === 'MR' ? 1 : parseNumber(inst.rescale_slope ?? inst.rescaleSlope ?? inst.RescaleSlope, 1),
      rescaleSlope: modality === 'MR' ? 1 : parseNumber(inst.rescale_slope ?? inst.rescaleSlope ?? inst.RescaleSlope, 1),
      WindowCenter: parseNumber(inst.window_center ?? inst.windowCenter ?? inst.WindowCenter, modality === 'CT' ? 40 : 400),
      windowCenter: parseNumber(inst.window_center ?? inst.windowCenter ?? inst.WindowCenter, modality === 'CT' ? 40 : 400),
      WindowWidth: parseNumber(inst.window_width ?? inst.windowWidth ?? inst.WindowWidth, modality === 'CT' ? 400 : 800),
      windowWidth: parseNumber(inst.window_width ?? inst.windowWidth ?? inst.WindowWidth, modality === 'CT' ? 400 : 800),
    };

    return result;
  }
}
