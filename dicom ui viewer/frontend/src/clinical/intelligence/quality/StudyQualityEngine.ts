export interface StudyQualityReport {
  overallQualityScore: number; // 0..100
  motionArtifactLevel: 'None' | 'Mild' | 'Moderate' | 'Severe';
  sliceCompletenessPct: number;
  qualityPassed: boolean;
  issues: string[];
}

export class StudyQualityEngine {
  public static evaluateQuality(numInstances: number, sliceSpacingMm: number): StudyQualityReport {
    const issues: string[] = [];
    let score = 100;

    if (numInstances < 10) {
      issues.push('Low slice count in series');
      score -= 30;
    }
    if (sliceSpacingMm <= 0 || sliceSpacingMm > 10) {
      issues.push('Non-standard slice thickness/spacing');
      score -= 20;
    }

    return {
      overallQualityScore: Math.max(0, score),
      motionArtifactLevel: score > 80 ? 'None' : 'Mild',
      sliceCompletenessPct: 100,
      qualityPassed: score >= 60,
      issues
    };
  }
}

export class ConfidenceEngine {
  public static computeConfidence(dataQualityScore: number, ruleMatchCount: number): number {
    return Math.min(1.0, (dataQualityScore / 100) * (0.8 + ruleMatchCount * 0.1));
  }
}
