export interface CalciumScoreResult {
  agatstonScore: number;
  calciumVolumeMm3: number;
  calciumMassMg: number;
  cadRadsCategory: 'CAD-RADS 0' | 'CAD-RADS 1' | 'CAD-RADS 2' | 'CAD-RADS 3' | 'CAD-RADS 4' | 'CAD-RADS 5';
}

export class CalciumScoring {
  public static calculateAgatstonScore(lesionHuList: { peakHu: number; areaMm2: number }[]): CalciumScoreResult {
    let totalScore = 0;
    let totalArea = 0;

    lesionHuList.forEach(lesion => {
      let factor = 1;
      if (lesion.peakHu >= 400) factor = 4;
      else if (lesion.peakHu >= 300) factor = 3;
      else if (lesion.peakHu >= 200) factor = 2;
      else if (lesion.peakHu >= 130) factor = 1;

      totalScore += lesion.areaMm2 * factor;
      totalArea += lesion.areaMm2;
    });

    let cadRads: 'CAD-RADS 0' | 'CAD-RADS 1' | 'CAD-RADS 2' | 'CAD-RADS 3' | 'CAD-RADS 4' | 'CAD-RADS 5' = 'CAD-RADS 0';
    if (totalScore > 400) cadRads = 'CAD-RADS 4';
    else if (totalScore > 100) cadRads = 'CAD-RADS 3';
    else if (totalScore > 10) cadRads = 'CAD-RADS 2';
    else if (totalScore > 0) cadRads = 'CAD-RADS 1';

    return {
      agatstonScore: totalScore,
      calciumVolumeMm3: totalArea * 3.0,
      calciumMassMg: totalScore * 0.2,
      cadRadsCategory: cadRads
    };
  }
}

export class CardiacWorkflow {
  public scoreCoronaryCalcium(lesions: { peakHu: number; areaMm2: number }[]): CalciumScoreResult {
    return CalciumScoring.calculateAgatstonScore(lesions);
  }
}
