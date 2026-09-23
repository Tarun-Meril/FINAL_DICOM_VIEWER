import { Plane } from './Plane';
import { Vector3 } from './Vector3';
import { Matrix4 } from './Matrix4';

export class Frustum {
  public planes: Plane[];

  constructor() {
    this.planes = [
      new Plane(), new Plane(), new Plane(),
      new Plane(), new Plane(), new Plane()
    ];
  }

  setFromProjectionMatrix(m: Matrix4): this {
    const me = m.elements;
    const me0 = me[0], me1 = me[1], me2 = me[2], me3 = me[3];
    const me4 = me[4], me5 = me[5], me6 = me[6], me7 = me[7];
    const me8 = me[8], me9 = me[9], me10 = me[10], me11 = me[11];
    const me12 = me[12], me13 = me[13], me14 = me[14], me15 = me[15];

    this.planes[0].setFromNormalAndCoplanarPoint(
      new Vector3(me3 - me0, me7 - me4, me11 - me8),
      new Vector3(me15 - me12, me15 - me13, me15 - me14)
    );
    return this;
  }

  containsPoint(point: Vector3): boolean {
    for (let i = 0; i < 6; i++) {
      if (this.planes[i].distanceToPoint(point) < 0) return false;
    }
    return true;
  }
}
