import { FrenetFrameCalculator } from '../../clinical/cpr/geometry/FrenetFrame';
import { ObliqueMPR, ThickSlab } from '../../clinical/mpr/MPRManager';
import { Vector3 } from '../../3d/math/Vector3';

export class ViewerValidationSuite {
  public static runViewerValidation(): boolean {
    console.log('  -> Executing Reconstruction & Viewport Validation Suite...');

    // 1. Oblique MPR Plane Rotation Test
    const oblique = new ObliqueMPR();
    oblique.setRotation(30, 60);
    if (oblique.pitchDeg !== 30 || oblique.rollDeg !== 60) throw new Error('Oblique MPR rotation validation failed');

    // 2. Thick Slab MIP Test
    const slab = new ThickSlab();
    const mipVal = slab.computeSlabVoxel([10, 50, 300, 100], 'mip');
    if (mipVal !== 300) throw new Error('Thick Slab MIP validation failed');

    // 3. Frenet-Frame Geometry Test
    const frames = FrenetFrameCalculator.computeFrames([new Vector3(0, 0, 0), new Vector3(0, 0, 10)]);
    if (frames.length !== 2) throw new Error('CPR Frenet Frame validation failed');

    console.log('  ✓ Viewer & Reconstruction Validation PASSED');
    return true;
  }
}
