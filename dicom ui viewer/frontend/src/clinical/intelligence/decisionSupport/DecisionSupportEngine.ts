import { QuantitativeBiomarker } from '../biomarkers/BiomarkerEngine';

export interface ClinicalRecommendation {
  id: string;
  recommendationText: string;
  urgency: 'Routine' | 'Urgent' | 'Critical';
  guidelineReference: string;
  triggeringBiomarkers: string[];
}

export class ClinicalRuleEngine {
  public static evaluateRules(biomarkers: QuantitativeBiomarker[]): ClinicalRecommendation[] {
    const recommendations: ClinicalRecommendation[] = [];

    biomarkers.forEach(bm => {
      if (bm.category === 'Vascular' && bm.value >= 70) {
        recommendations.push({
          id: `rec-vascular-${bm.id}`,
          recommendationText: `Severe ${bm.name} (${bm.value.toFixed(1)}%). Recommend urgent Vascular Surgery consultation and CTA angiogram review.`,
          urgency: 'Urgent',
          guidelineReference: 'ACC/AHA 2024 Peripheral Arterial Disease Guidelines',
          triggeringBiomarkers: [bm.id]
        });
      }

      if (bm.category === 'Cardiac' && bm.value >= 400) {
        recommendations.push({
          id: `rec-cardiac-${bm.id}`,
          recommendationText: `Extremely High Agatston CAC Score (${bm.value.toFixed(0)}). High risk of obstructive CAD. Recommend Cardiology referral.`,
          urgency: 'Urgent',
          guidelineReference: 'SCCT CAD-RADS 2.0 Expert Consensus',
          triggeringBiomarkers: [bm.id]
        });
      }
    });

    return recommendations;
  }
}

export class DecisionSupportEngine {
  public evaluateBiomarkers(biomarkers: QuantitativeBiomarker[]): ClinicalRecommendation[] {
    return ClinicalRuleEngine.evaluateRules(biomarkers);
  }
}
