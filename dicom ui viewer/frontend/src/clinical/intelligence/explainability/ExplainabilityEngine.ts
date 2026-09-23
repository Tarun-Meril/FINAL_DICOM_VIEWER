import { ClinicalRecommendation } from '../decisionSupport/DecisionSupportEngine';
import { QuantitativeBiomarker } from '../biomarkers/BiomarkerEngine';

export interface ExplanationChain {
  recommendationId: string;
  recommendationText: string;
  evidenceBiomarkers: QuantitativeBiomarker[];
  guidelineReference: string;
  reasoningSteps: string[];
}

export class ExplainabilityEngine {
  public static buildExplanation(rec: ClinicalRecommendation, biomarkers: QuantitativeBiomarker[]): ExplanationChain {
    const triggering = biomarkers.filter(bm => rec.triggeringBiomarkers.includes(bm.id));
    const steps = triggering.map(bm => `Measured ${bm.name} = ${bm.value} ${bm.unit} (Abnormal: ${bm.isAbnormal}). Exceeds diagnostic threshold.`);

    return {
      recommendationId: rec.id,
      recommendationText: rec.recommendationText,
      evidenceBiomarkers: triggering,
      guidelineReference: rec.guidelineReference,
      reasoningSteps: steps
    };
  }
}
