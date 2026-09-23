import { Vector3 } from '../../../3d/math/Vector3';

export interface StenosisResult {
  vesselName: string;
  referenceDiameterMm: number;
  stenosisDiameterMm: number;
  referenceAreaMm2: number;
  stenosisAreaMm2: number;
  diameterStenosisPercentage: number;
  areaStenosisPercentage: number;
  severityCategory: 'Normal' | 'Mild' | 'Moderate' | 'Severe' | 'Occluded';
}

export class StenosisAnalysis {
  public static calculateStenosis(
    vesselName: string,
    refDiameterMm: number,
    stenosisDiameterMm: number
  ): StenosisResult {
    const refArea = Math.PI * Math.pow(refDiameterMm / 2, 2);
    const stenArea = Math.PI * Math.pow(stenosisDiameterMm / 2, 2);

    const diamSten = Math.max(0, ((refDiameterMm - stenosisDiameterMm) / refDiameterMm) * 100);
    const areaSten = Math.max(0, ((refArea - stenArea) / refArea) * 100);

    let category: 'Normal' | 'Mild' | 'Moderate' | 'Severe' | 'Occluded' = 'Normal';
    if (diamSten >= 100) category = 'Occluded';
    else if (diamSten >= 70) category = 'Severe';
    else if (diamSten >= 50) category = 'Moderate';
    else if (diamSten >= 25) category = 'Mild';

    return {
      vesselName,
      referenceDiameterMm: refDiameterMm,
      stenosisDiameterMm,
      referenceAreaMm2: refArea,
      stenosisAreaMm2: stenArea,
      diameterStenosisPercentage: diamSten,
      areaStenosisPercentage: areaSten,
      severityCategory: category
    };
  }
}

export class VesselTortuosity {
  public static computeTortuosityIndex(pathPoints: Vector3[]): number {
    if (pathPoints.length < 2) return 1.0;
    let curveLength = 0;
    for (let i = 0; i < pathPoints.length - 1; i++) {
      curveLength += pathPoints[i].distanceTo(pathPoints[i + 1]);
    }
    const straightLength = pathPoints[0].distanceTo(pathPoints[pathPoints.length - 1]) || 1;
    return curveLength / straightLength;
  }
}

export class PlaqueAnalysis {
  public static characterizePlaque(huValue: number): 'Soft Plaque' | 'Mixed Plaque' | 'Calcified Plaque' {
    if (huValue > 400) return 'Calcified Plaque';
    if (huValue > 130) return 'Mixed Plaque';
    return 'Soft Plaque';
  }
}

export class VesselAnalysisEngine {
  public analyzeVessel(vesselName: string, refDiam: number, minDiam: number, points: Vector3[]): StenosisResult {
    return StenosisAnalysis.calculateStenosis(vesselName, refDiam, minDiam);
  }
}
