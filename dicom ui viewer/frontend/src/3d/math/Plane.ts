import { Vector3 } from './Vector3';

export class Plane {
  public normal: Vector3;
  public constant: number;

  constructor(normal = new Vector3(0, 1, 0), constant = 0) {
    this.normal = normal.normalize();
    this.constant = constant;
  }

  distanceToPoint(point: Vector3): number {
    return this.normal.dot(point) + this.constant;
  }

  setFromNormalAndCoplanarPoint(normal: Vector3, point: Vector3): this {
    this.normal = normal.normalize();
    this.constant = -this.normal.dot(point);
    return this;
  }
}
