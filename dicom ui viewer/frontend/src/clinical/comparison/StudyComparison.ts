import { ClinicalStudyData, ClinicalLesionData } from '../model/ClinicalCase';

export interface LongitudinalComparisonResult {
  lesionId: string;
  lesionName: string;
  baselineVolumeCm3: number;
  followUpVolumeCm3: number;
  volumeChangeCm3: number;
  volumeChangePercentage: number;
  responseCategory: 'CR' | 'PR' | 'SD' | 'PD'; // RECIST 1.1 Criteria: Complete Response, Partial Response, Stable Disease, Progressive Disease
}

export class LongitudinalAnalysis {
  public static compareLesions(
    lesionId: string,
    lesionName: string,
    baselineVolCm3: number,
    followUpVolCm3: number
  ): LongitudinalComparisonResult {
    const diff = followUpVolCm3 - baselineVolCm3;
    const pct = baselineVolCm3 > 0 ? (diff / baselineVolCm3) * 100 : 0;

    let response: 'CR' | 'PR' | 'SD' | 'PD' = 'SD';
    if (followUpVolCm3 === 0) response = 'CR';
    else if (pct <= -30) response = 'PR';
    else if (pct >= 20) response = 'PD';

    return {
      lesionId,
      lesionName,
      baselineVolumeCm3: baselineVolCm3,
      followUpVolumeCm3: followUpVolCm3,
      volumeChangeCm3: diff,
      volumeChangePercentage: pct,
      responseCategory: response
    };
  }
}

export class LesionTracker {
  private trackedLesions = new Map<string, ClinicalLesionData>();

  public registerLesion(lesion: ClinicalLesionData): void {
    this.trackedLesions.set(lesion.lesionId, lesion);
  }

  public getLesion(lesionId: string): ClinicalLesionData | undefined {
    return this.trackedLesions.get(lesionId);
  }
}

export class StudyComparison {
  public baselineStudy: ClinicalStudyData | null = null;
  public followUpStudy: ClinicalStudyData | null = null;
  public lesionTracker = new LesionTracker();

  public setStudies(baseline: ClinicalStudyData, followUp: ClinicalStudyData): void {
    this.baselineStudy = baseline;
    this.followUpStudy = followUp;
  }
}
