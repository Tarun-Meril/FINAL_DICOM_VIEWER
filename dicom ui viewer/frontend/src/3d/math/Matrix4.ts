import { Vector3 } from './Vector3';
import { Quaternion } from './Quaternion';

export class Matrix4 {
  public elements: Float32Array;

  constructor() {
    this.elements = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
  }

  identity(): this {
    const me = this.elements;
    me[0] = 1; me[4] = 0; me[8] = 0; me[12] = 0;
    me[1] = 0; me[5] = 1; me[9] = 0; me[13] = 0;
    me[2] = 0; me[6] = 0; me[10] = 1; me[14] = 0;
    me[3] = 0; me[7] = 0; me[11] = 0; me[15] = 1;
    return this;
  }

  clone(): Matrix4 {
    const m = new Matrix4();
    m.elements.set(this.elements);
    return m;
  }

  static perspective(fovY: number, aspect: number, near: number, far: number): Matrix4 {
    const m = new Matrix4();
    const f = 1.0 / Math.tan((fovY * Math.PI / 180) / 2);
    const nf = 1 / (near - far);
    const me = m.elements;

    me[0] = f / aspect;
    me[5] = f;
    me[10] = (far + near) * nf;
    me[11] = -1;
    me[14] = (2 * far * near) * nf;
    me[15] = 0;

    return m;
  }

  static orthographic(left: number, right: number, bottom: number, top: number, near: number, far: number): Matrix4 {
    const m = new Matrix4();
    const rl = 1 / (right - left);
    const tb = 1 / (top - bottom);
    const fn = 1 / (far - near);
    const me = m.elements;

    me[0] = 2 * rl;
    me[5] = 2 * tb;
    me[10] = -2 * fn;
    me[12] = -(right + left) * rl;
    me[13] = -(top + bottom) * tb;
    me[14] = -(far + near) * fn;
    me[15] = 1;

    return m;
  }

  static lookAt(eye: Vector3, target: Vector3, up: Vector3): Matrix4 {
    const z = eye.sub(target).normalize();
    const x = up.cross(z).normalize();
    const y = z.cross(x);

    const m = new Matrix4();
    const me = m.elements;

    me[0] = x.x; me[4] = x.y; me[8] = x.z; me[12] = -x.dot(eye);
    me[1] = y.x; me[5] = y.y; me[9] = y.z; me[13] = -y.dot(eye);
    me[2] = z.x; me[6] = z.y; me[10] = z.z; me[14] = -z.dot(eye);
    me[3] = 0;   me[7] = 0;   me[11] = 0;   me[15] = 1;

    return m;
  }

  multiply(m: Matrix4): Matrix4 {
    const ae = this.elements;
    const be = m.elements;
    const te = new Float32Array(16);

    const a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12];
    const a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13];
    const a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14];
    const a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15];

    const b11 = be[0], b12 = be[4], b13 = be[8], b14 = be[12];
    const b21 = be[1], b22 = be[5], b23 = be[9], b24 = be[13];
    const b31 = be[2], b32 = be[6], b33 = be[10], b34 = be[14];
    const b41 = be[3], b42 = be[7], b43 = be[11], b44 = be[15];

    te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
    te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
    te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
    te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;

    te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
    te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
    te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
    te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;

    te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
    te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
    te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
    te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;

    te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
    te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
    te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
    te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;

    const res = new Matrix4();
    res.elements = te;
    return res;
  }

  invert(): Matrix4 {
    const me = this.elements;
    const te = new Float32Array(16);

    const n11 = me[0], n12 = me[4], n13 = me[8], n14 = me[12];
    const n21 = me[1], n22 = me[5], n23 = me[9], n24 = me[13];
    const n31 = me[2], n32 = me[6], n33 = me[10], n34 = me[14];
    const n41 = me[3], n42 = me[7], n43 = me[11], n44 = me[15];

    const t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44;
    const t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44;
    const t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44;
    const t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;

    const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;

    if (det === 0) return new Matrix4();

    const detInv = 1.0 / det;

    te[0] = t11 * detInv;
    te[1] = (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * detInv;
    te[2] = (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * detInv;
    te[3] = (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * detInv;

    te[4] = t12 * detInv;
    te[5] = (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * detInv;
    te[6] = (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * detInv;
    te[7] = (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * detInv;

    te[8] = t13 * detInv;
    te[9] = (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * detInv;
    te[10] = (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * detInv;
    te[11] = (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * detInv;

    te[12] = t14 * detInv;
    te[13] = (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * detInv;
    te[14] = (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * detInv;
    te[15] = (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * detInv;

    const res = new Matrix4();
    res.elements = te;
    return res;
  }

  transformVector3(v: Vector3): Vector3 {
    const me = this.elements;
    const x = v.x, y = v.y, z = v.z;
    const w = me[3] * x + me[7] * y + me[11] * z + me[15] || 1;

    return new Vector3(
      (me[0] * x + me[4] * y + me[8] * z + me[12]) / w,
      (me[1] * x + me[5] * y + me[9] * z + me[13]) / w,
      (me[2] * x + me[6] * y + me[10] * z + me[14]) / w
    );
  }
}
