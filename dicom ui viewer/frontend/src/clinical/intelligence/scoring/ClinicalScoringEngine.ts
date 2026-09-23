export interface ClinicalScoreResult {
  system: 'CAD-RADS' | 'Lung-RADS' | 'PI-RADS' | 'LI-RADS' | 'BI-RADS' | 'RECIST';
  scoreCode: string;
  scoreDescription: string;
  managementGuideline: string;
}

export class ClinicalScoringEngine {
  public static computeLungRads(noduleSizeMm: number, solidPct = 100): ClinicalScoreResult {
    if (noduleSizeMm >= 15) {
      return {
        system: 'Lung-RADS',
        scoreCode: 'Lung-RADS 4B',
        scoreDescription: 'Very High Risk Nodule (≥ 15mm)',
        managementGuideline: 'Chest CT in 3 months, PET/CT, or tissue sampling.'
      };
    }
    if (noduleSizeMm >= 8) {
      return {
        system: 'Lung-RADS',
        scoreCode: 'Lung-RADS 4A',
        scoreDescription: 'Moderately Suspicious Nodule (8–14mm)',
        managementGuideline: '3-month follow-up CT or PET/CT.'
      };
    }
    if (noduleSizeMm >= 6) {
      return {
        system: 'Lung-RADS',
        scoreCode: 'Lung-RADS 3',
        scoreDescription: 'Probably Benign Nodule (6–7mm)',
        managementGuideline: '6-month follow-up Low-Dose CT.'
      };
    }
    return {
      system: 'Lung-RADS',
      scoreCode: 'Lung-RADS 2',
      scoreDescription: 'Benign Appearance Nodule (< 6mm)',
      managementGuideline: '12-month routine screening Low-Dose CT.'
    };
  }
}
