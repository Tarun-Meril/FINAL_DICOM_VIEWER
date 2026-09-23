import { AIDetectionCandidate } from '../detection/LungNoduleDetection';

export interface WorklistTriageItem {
  studyUid: string;
  patientName: string;
  triagePriority: 'STAT / Emergency' | 'Urgent' | 'Routine';
  priorityScore: number; // 0..100
  criticalFindings: string[];
}

export class WorklistPrioritizer {
  public static prioritizeStudy(studyUid: string, patientName: string, candidates: AIDetectionCandidate[]): WorklistTriageItem {
    const criticals = candidates.filter(c => c.isCritical);
    let priority: 'STAT / Emergency' | 'Urgent' | 'Routine' = 'Routine';
    let score = 10;

    if (criticals.length > 0) {
      priority = 'STAT / Emergency';
      score = 95;
    } else if (candidates.length > 0) {
      priority = 'Urgent';
      score = 65;
    }

    return {
      studyUid,
      patientName,
      triagePriority: priority,
      priorityScore: score,
      criticalFindings: criticals.map(c => c.type.replace('_', ' ').toUpperCase())
    };
  }
}
