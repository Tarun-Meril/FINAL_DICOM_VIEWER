import { DicomValidator } from '../../3d/validation/DicomValidator';
import { Vector3 } from '../../3d/math/Vector3';

export class DicomComplianceTest {
  public static validateAllModalities(): { modalitiesTested: string[]; passedCount: number } {
    console.log('  -> Executing DICOM Modality & Multi-Series Compliance Suite...');
    const modalities = ['CT', 'MR', 'PET', 'DX', 'XA', 'MG', 'US'];
    modalities.forEach(modality => {
      const mockVolume = {
        metadata: {
          studyInstanceUid: `study-${modality}`,
          seriesInstanceUid: `series-${modality}`,
          dimensions: new Vector3(64, 64, 64),
          spacing: new Vector3(1, 1, 1),
          origin: new Vector3(0, 0, 0),
          orientation: [1, 0, 0, 0, 1, 0],
          scalarType: 'Int16',
          bitsAllocated: 16,
          windowCenter: 40,
          windowWidth: 400,
          rescaleIntercept: 0,
          rescaleSlope: 1,
          modality
        },
        scalarData: new Int16Array(64 * 64 * 64)
      };
      const warnings = DicomValidator.validateDataset(mockVolume as any);
      if (warnings.length > 0) throw new Error(`DICOM validation failed for modality ${modality}`);
    });

    return { modalitiesTested: modalities, passedCount: modalities.length };
  }
}
