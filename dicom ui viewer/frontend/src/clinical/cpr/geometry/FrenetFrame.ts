import { Vector3 } from '../../../3d/math/Vector3';

export interface FrenetFrame {
  position: Vector3;
  tangent: Vector3;
  normal: Vector3;
  binormal: Vector3;
}

export class TangentCalculator {
  public static computeTangent(p0: Vector3, p1: Vector3): Vector3 {
    return p1.sub(p0).normalize();
  }
}

export class NormalCalculator {
  public static computeNormal(tangent: Vector3, previousNormal?: Vector3): Vector3 {
    if (previousNormal) {
      // Parallel transport to prevent 3D centerline twisting
      const proj = previousNormal.sub(tangent.multiplyScalar(previousNormal.dot(tangent)));
      const len = proj.length();
      if (len > 1e-4) return proj.normalize();
    }
    const arbitrary = Math.abs(tangent.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    return tangent.cross(arbitrary).normalize();
  }
}

export class BinormalCalculator {
  public static computeBinormal(tangent: Vector3, normal: Vector3): Vector3 {
    return tangent.cross(normal).normalize();
  }
}

export class FrenetFrameCalculator {
  public static computeFrames(points: Vector3[]): FrenetFrame[] {
    const frames: FrenetFrame[] = [];
    if (points.length < 2) return frames;

    let prevNormal: Vector3 | undefined;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const pNext = points[Math.min(points.length - 1, i + 1)];
      const pPrev = points[Math.max(0, i - 1)];

      const tangent = TangentCalculator.computeTangent(pPrev, pNext);
      const normal = NormalCalculator.computeNormal(tangent, prevNormal);
      const binormal = BinormalCalculator.computeBinormal(tangent, normal);
      prevNormal = normal;

      frames.push({ position: p.clone(), tangent, normal, binormal });
    }
    return frames;
  }
}
