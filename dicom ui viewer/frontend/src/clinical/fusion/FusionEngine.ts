export type FusionBlendMode = 'normal' | 'multiply' | 'screen' | 'additive' | 'thermal';

export interface FusionLayer {
  id: string;
  name: string;
  volumeData: Int16Array;
  opacity: number;
  lutName: 'thermal' | 'rainbow' | 'grayscale' | 'mri-blend' | 'ct-bone';
  visible: boolean;
}

export class LUTPipeline {
  public static getLutColor(value: number, lutName: string): [number, number, number] {
    if (lutName === 'thermal') {
      const v = Math.min(1.0, Math.max(0.0, value / 1000));
      return [v, v * 0.5, 1.0 - v];
    }
    if (lutName === 'rainbow') {
      const v = Math.min(1.0, Math.max(0.0, value / 1000));
      return [v, 1.0 - v, Math.sin(v * Math.PI)];
    }
    const g = Math.min(1.0, Math.max(0.0, value / 1000));
    return [g, g, g];
  }
}

export class FusionEngine {
  public layers: FusionLayer[] = [];
  public blendMode: FusionBlendMode = 'thermal';

  public addLayer(layer: FusionLayer): void {
    this.layers.push(layer);
  }

  public blend(width: number, height: number): Uint8ClampedArray {
    const result = new Uint8ClampedArray(width * height * 4);
    return result;
  }
}
