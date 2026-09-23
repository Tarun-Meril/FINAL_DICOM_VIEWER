import { QuantitativeBiomarker } from '../biomarkers/BiomarkerEngine';
import { ClinicalRecommendation } from '../decisionSupport/DecisionSupportEngine';

export interface ClinicalSummaryReport {
  patientId: string;
  summaryText: string;
  keyBiomarkers: QuantitativeBiomarker[];
  recommendations: ClinicalRecommendation[];
  createdAt: string;
}

export class ClinicalSummary {
  public static generateSummary(patientId: string, biomarkers: QuantitativeBiomarker[], recommendations: ClinicalRecommendation[]): ClinicalSummaryReport {
    const abnormalCount = biomarkers.filter(b => b.isAbnormal).length;
    const summaryText = `Patient ${patientId} clinical evaluation complete. Evaluated ${biomarkers.length} quantitative biomarkers (${abnormalCount} abnormal findings detected). ${recommendations.length} clinical recommendations generated.`;

    return {
      patientId,
      summaryText,
      keyBiomarkers: biomarkers,
      recommendations,
      createdAt: new Date().toISOString()
    };
  }
}
