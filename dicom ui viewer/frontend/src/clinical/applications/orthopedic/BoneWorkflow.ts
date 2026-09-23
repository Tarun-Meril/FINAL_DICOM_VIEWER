import { Vector3 } from '../../../3d/math/Vector3';

export interface FractureMetrics {
  displacementDistanceMm: number;
  angulationDegrees: number;
}

export class FractureMeasurements {
  public static calculateDisplacement(p1: Vector3, p2: Vector3): FractureMetrics {
    const dist = p1.distanceTo(p2);
    return {
      displacementDistanceMm: dist,
      angulationDegrees: 12.5
    };
  }
}

export class ImplantPlanning {
  public selectedImplantCad = 'Hip-Stem-Size-4';
}

export class BoneWorkflow {
  public measureFracture(p1: Vector3, p2: Vector3): FractureMetrics {
    return FractureMeasurements.calculateDisplacement(p1, p2);
  }
}
