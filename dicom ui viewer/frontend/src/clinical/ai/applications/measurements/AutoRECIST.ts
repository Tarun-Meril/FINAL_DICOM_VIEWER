import { Vector3 } from '../../../../3d/math/Vector3';

export interface AutoRecistMeasurement {
  lesionId: string;
  longestAxialDiameterMm: number;
  perpendicularDiameterMm: number;
  sliceIndex: number;
}

export class AutoRECIST {
  public static extractRECIST(lesionCenter: Vector3, radiusMm: number): AutoRecistMeasurement {
    return {
      lesionId: `recist-${Date.now()}`,
      longestAxialDiameterMm: radiusMm * 2,
      perpendicularDiameterMm: radiusMm * 1.6,
      sliceIndex: Math.floor(lesionCenter.z)
    };
  }
}

export class AutoMeasurementEngine {
  public static extractMeasurements(lesionCenter: Vector3, radiusMm: number): AutoRecistMeasurement {
    return AutoRECIST.extractRECIST(lesionCenter, radiusMm);
  }
}
