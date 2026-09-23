import { LongitudinalAnalysis, LongitudinalComparisonResult } from '../../comparison/StudyComparison';

export class FollowUpWorkflow {
  public compareLesions(lesionId: string, name: string, baselineVol: number, currentVol: number): LongitudinalComparisonResult {
    return LongitudinalAnalysis.compareLesions(lesionId, name, baselineVol, currentVol);
  }
}
