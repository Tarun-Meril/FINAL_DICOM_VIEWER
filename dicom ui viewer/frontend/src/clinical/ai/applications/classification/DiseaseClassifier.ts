export interface AIClassificationResult {
  primaryDisease: string;
  severity: 'Normal' | 'Mild' | 'Moderate' | 'Severe';
  probability: number;
  riskCategory: 'Low Risk' | 'Moderate Risk' | 'High Risk';
}

export class DiseaseClassifier {
  public static classify(modality: string, bodyPart: string): AIClassificationResult {
    return {
      primaryDisease: bodyPart === 'Lungs' ? 'Pulmonary Embolism' : 'Acute Stroke',
      severity: 'Moderate',
      probability: 0.89,
      riskCategory: 'High Risk'
    };
  }
}
