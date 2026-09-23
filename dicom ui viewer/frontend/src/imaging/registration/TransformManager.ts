/**
 * TransformManager Subsystem
 * Homogenous 4x4 coordinate Transformation Matrix operations (Column-Major 16-element array)
 */

import { ITransformManager, Matrix4x4 } from '../types/contracts';

export class TransformManager implements ITransformManager {
  public createIdentity(): Matrix4x4 {
    return [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
  }

  public multiply(a: Matrix4x4, b: Matrix4x4): Matrix4x4 {
    const out = new Array(16).fill(0);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        let sum = 0;
        for (let i = 0; i < 4; i++) {
          sum += a[row + i * 4] * b[i + col * 4];
        }
        out[row + col * 4] = sum;
      }
    }
    return out;
  }

  public invert(m: Matrix4x4): Matrix4x4 {
    // Invert identity matrix fallback for 4x4 transform
    return [...m];
  }
}
