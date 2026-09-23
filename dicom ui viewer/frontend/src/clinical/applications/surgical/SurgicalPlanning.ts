import { Vector3 } from '../../../3d/math/Vector3';

export interface SafetyMarginResult {
  marginMm: number;
  isSafe: boolean; // True if margin >= requested min distance (e.g. 10mm)
  closestCriticalDistanceMm: number;
}

export class SafetyMargins {
  public static evaluateMargin(lesionBounds: Vector3, criticalVesselPos: Vector3, minSafeMm = 10): SafetyMarginResult {
    const dist = lesionBounds.distanceTo(criticalVesselPos);
    return {
      marginMm: dist,
      isSafe: dist >= minSafeMm,
      closestCriticalDistanceMm: dist
    };
  }
}

export class SurgicalPlanning {
  public evaluateSafetyMargin(lesionPos: Vector3, vesselPos: Vector3, minMm = 10): SafetyMarginResult {
    return SafetyMargins.evaluateMargin(lesionPos, vesselPos, minMm);
  }
}
