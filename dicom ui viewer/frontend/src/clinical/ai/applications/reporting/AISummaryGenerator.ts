import { AIDetectionCandidate } from '../detection/LungNoduleDetection';

export interface AIDraftReport {
  studyUid: string;
  findingsDraft: string[];
  impressionDraft: string;
  generatedAt: string;
}

export class AISummaryGenerator {
  public static generateDraftReport(studyUid: string, candidates: AIDetectionCandidate[]): AIDraftReport {
    const findings = candidates.map(c => `AI Detected ${c.type.replace('_', ' ')} (Diameter: ${c.diameterMm}mm, Confidence: ${(c.confidence * 100).toFixed(0)}%).`);
    const impression = candidates.some(c => c.isCritical)
      ? 'CRITICAL FINDING: Immediate clinical evaluation recommended.'
      : 'Abnormal findings detected as detailed above. Correlation recommended.';

    return {
      studyUid,
      findingsDraft: findings.length > 0 ? findings : ['No acute radiological abnormalities detected by AI.'],
      impressionDraft: impression,
      generatedAt: new Date().toISOString()
    };
  }
}
