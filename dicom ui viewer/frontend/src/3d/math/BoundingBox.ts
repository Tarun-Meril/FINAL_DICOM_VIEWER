import { Vector3 } from './Vector3';

export class BoundingBox {
  public min: Vector3;
  public max: Vector3;

  constructor(min = new Vector3(-1, -1, -1), max = new Vector3(1, 1, 1)) {
    this.min = min;
    this.max = max;
  }

  getCenter(): Vector3 {
    return this.min.add(this.max).multiplyScalar(0.5);
  }

  getSize(): Vector3 {
    return this.max.sub(this.min);
  }

  containsPoint(p: Vector3): boolean {
    return (
      p.x >= this.min.x && p.x <= this.max.x &&
      p.y >= this.min.y && p.y <= this.max.y &&
      p.z >= this.min.z && p.z <= this.max.z
    );
  }
}
