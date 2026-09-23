import { ClinicalFindingData, ClinicalMeasurementData } from '../model/ClinicalCase';

export class DicomMapping {
  public static toDicomSR(finding: ClinicalFindingData): Record<string, any> {
    return {
      ConceptNameCodeSequence: { CodeValue: '121070', CodeMeaning: 'Finding' },
      TextValue: finding.description,
      Category: finding.category,
      Severity: finding.severity,
      Measurements: finding.measurements.map(m => ({
        ConceptName: m.type,
        NumericValue: m.value,
        Unit: m.unit
      }))
    };
  }
}

export class MetadataMapper {
  public static mapDicomTagsToClinicalModel(dicomTags: Record<string, any>): Record<string, any> {
    return {
      patientId: dicomTags['0010,0020'] || 'P000',
      patientName: dicomTags['0010,0010'] || 'Anonymous',
      studyUid: dicomTags['0020,000D'] || '',
      seriesUid: dicomTags['0020,000E'] || ''
    };
  }
}

export class InteroperabilityEngine {
  public dicomMapping = DicomMapping;
  public metadataMapper = MetadataMapper;
}
