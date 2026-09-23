import { Vector3 } from './Vector3';

export class Ray {
  public origin: Vector3;
  public direction: Vector3;

  constructor(origin = new Vector3(), direction = new Vector3(0, 0, -1)) {
    this.origin = origin;
    this.direction = direction.normalize();
  }

  at(t: number): Vector3 {
    return this.origin.add(this.direction.multiplyScalar(t));
  }

  intersectBox(boxMin: Vector3, boxMax: Vector3): { tNear: number; tFar: number } | null {
    let tmin = (boxMin.x - this.origin.x) / (this.direction.x || 1e-6);
    let tmax = (boxMax.x - this.origin.x) / (this.direction.x || 1e-6);
    if (tmin > tmax) [tmin, tmax] = [tmax, tmin];

    let tymin = (boxMin.y - this.origin.y) / (this.direction.y || 1e-6);
    let tymax = (boxMax.y - this.origin.y) / (this.direction.y || 1e-6);
    if (tymin > tymax) [tymin, tymax] = [tymax, tymin];

    if ((tmin > tymax) || (tymin > tmax)) return null;
    if (tymin > tmin) tmin = tymin;
    if (tymax < tmax) tmax = tymax;

    let tzmin = (boxMin.z - this.origin.z) / (this.direction.z || 1e-6);
    let tzmax = (boxMax.z - this.origin.z) / (this.direction.z || 1e-6);
    if (tzmin > tzmax) [tzmin, tzmax] = [tzmax, tzmin];

    if ((tmin > tzmax) || (tzmin > tmax)) return null;
    if (tzmin > tmin) tmin = tzmin;
    if (tzmax < tmax) tmax = tzmax;

    return { tNear: tmin, tFar: tmax };
  }
}
