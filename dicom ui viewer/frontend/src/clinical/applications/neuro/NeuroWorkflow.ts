export interface AneurysmMetrics {
  aneurysmId: string;
  maxDomeDiameterMm: number;
  neckWidthMm: number;
  domeToNeckRatio: number;
  ruptureRiskCategory: 'Low' | 'Moderate' | 'High';
}

export class AneurysmWorkflow {
  public static analyzeAneurysm(id: string, domeDiamMm: number, neckWidthMm: number): AneurysmMetrics {
    const ratio = neckWidthMm > 0 ? domeDiamMm / neckWidthMm : 1.0;
    let risk: 'Low' | 'Moderate' | 'High' = 'Low';
    if (domeDiamMm >= 7.0 || ratio > 2.0) risk = 'High';
    else if (domeDiamMm >= 4.0) risk = 'Moderate';

    return {
      aneurysmId: id,
      maxDomeDiameterMm: domeDiamMm,
      neckWidthMm,
      domeToNeckRatio: ratio,
      ruptureRiskCategory: risk
    };
  }
}

export class NeuroWorkflow {
  public analyzeBrainAneurysm(id: string, dome: number, neck: number): AneurysmMetrics {
    return AneurysmWorkflow.analyzeAneurysm(id, dome, neck);
  }
}
