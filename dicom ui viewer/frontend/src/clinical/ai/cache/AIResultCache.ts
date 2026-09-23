export class AIResultCache {
  private cache = new Map<string, Uint8Array>();

  public get(key: string): Uint8Array | undefined {
    return this.cache.get(key);
  }

  public set(key: string, labelMap: Uint8Array): void {
    this.cache.set(key, labelMap);
  }
}

export class PredictionValidator {
  public static validateOutput(outputTensor: Uint8Array | Float32Array, expectedVoxels: number): boolean {
    if (!outputTensor || outputTensor.length < expectedVoxels) return false;
    return true;
  }
}

export class DatasetRegistry {
  public registeredDatasets = ['MONAI-BraTS', 'LUNA16-Nodule', 'LiTS-Liver'];
}
