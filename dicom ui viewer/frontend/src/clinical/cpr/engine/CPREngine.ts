import { Vector3 } from '../../../3d/math/Vector3';
import { FrenetFrameCalculator, FrenetFrame } from '../geometry/FrenetFrame';
import { CenterlineEditor } from '../centerline/CenterlineEditor';

export interface CPRResampleResult {
  unfoldedImageWidth: number;
  unfoldedImageHeight: number;
  pixelData: Int16Array;
}

export class CurvedResampler {
  public resampleAlongCurve(volumeData: Int16Array, dims: Vector3, frames: FrenetFrame[], sliceRadiusMm = 40): CPRResampleResult {
    const numSlices = frames.length;
    const sliceWidthPixels = 256;
    const pixelData = new Int16Array(numSlices * sliceWidthPixels);

    return {
      unfoldedImageWidth: numSlices,
      unfoldedImageHeight: sliceWidthPixels,
      pixelData
    };
  }
}

export class CPREngine {
  public editor = new CenterlineEditor();
  public resampler = new CurvedResampler();
  public mode: 'straightened' | 'stretched' | 'panoramic' = 'straightened';

  public generateCPROutput(volumeData: Int16Array, dims: Vector3): CPRResampleResult {
    const frames = FrenetFrameCalculator.computeFrames(this.editor.controlPoints);
    return this.resampler.resampleAlongCurve(volumeData, dims, frames);
  }
}

export class CPRViewport {
  public width = 800;
  public height = 400;
  public activeSliceIndex = 0;
}
