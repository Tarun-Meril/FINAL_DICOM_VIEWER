import { Vector3 } from './Vector3';

export class Quaternion {
  public x: number;
  public y: number;
  public z: number;
  public w: number;

  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  set(x: number, y: number, z: number, w: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  clone(): Quaternion {
    return new Quaternion(this.x, this.y, this.z, this.w);
  }

  setFromAxisAngle(axis: Vector3, angle: number): this {
    const halfAngle = angle / 2;
    const s = Math.sin(halfAngle);
    const normAxis = axis.normalize();
    this.x = normAxis.x * s;
    this.y = normAxis.y * s;
    this.z = normAxis.z * s;
    this.w = Math.cos(halfAngle);
    return this;
  }

  multiply(q: Quaternion): Quaternion {
    const qax = this.x, qay = this.y, qaz = this.z, qaw = this.w;
    const qbx = q.x, qby = q.y, qbz = q.z, qbw = q.w;

    return new Quaternion(
      qax * qbw + qaw * qbx + qay * qbz - qaz * qby,
      qay * qbw + qaw * qby + qaz * qbx - qax * qbz,
      qaz * qbw + qaw * qbz + qax * qby - qay * qbx,
      qaw * qbw - qax * qbx - qay * qby - qaz * qbz
    );
  }

  slerp(qb: Quaternion, t: number): Quaternion {
    if (t === 0) return this.clone();
    if (t === 1) return qb.clone();

    let cosHalfTheta = this.w * qb.w + this.x * qb.x + this.y * qb.y + this.z * qb.z;

    let target = qb.clone();
    if (cosHalfTheta < 0) {
      target = new Quaternion(-qb.x, -qb.y, -qb.z, -qb.w);
      cosHalfTheta = -cosHalfTheta;
    }

    if (cosHalfTheta >= 1.0) {
      return this.clone();
    }

    const sqrSinHalfTheta = 1.0 - cosHalfTheta * cosHalfTheta;
    if (sqrSinHalfTheta <= Number.EPSILON) {
      const s = 1.0 - t;
      return new Quaternion(
        s * this.x + t * target.x,
        s * this.y + t * target.y,
        s * this.z + t * target.z,
        s * this.w + t * target.w
      );
    }

    const sinHalfTheta = Math.sqrt(sqrSinHalfTheta);
    const halfTheta = Math.atan2(sinHalfTheta, cosHalfTheta);
    const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
    const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

    return new Quaternion(
      this.x * ratioA + target.x * ratioB,
      this.y * ratioA + target.y * ratioB,
      this.z * ratioA + target.z * ratioB,
      this.w * ratioA + target.w * ratioB
    );
  }

  rotateVector(v: Vector3): Vector3 {
    const qv = new Vector3(this.x, this.y, this.z);
    const uv = qv.cross(v);
    const uuv = qv.cross(uv);
    return v.add(uv.multiplyScalar(2 * this.w)).add(uuv.multiplyScalar(2));
  }
}
