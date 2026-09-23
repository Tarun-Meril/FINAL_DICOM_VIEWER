/**
 * ModelCacheManager Subsystem
 * Caches tensor buffers and compiled ONNX/TensorRT model weights for warm startup
 */

import { IModelCacheManager } from '../types/contracts';

export class ModelCacheManager implements IModelCacheManager {
  private cache: Map<string, ArrayBuffer> = new Map();

  public cacheTensorBuffer(key: string, buffer: ArrayBuffer): void {
    this.cache.set(key, buffer);
  }

  public getTensorBuffer(key: string): ArrayBuffer | undefined {
    return this.cache.get(key);
  }

  public clearCache(): void {
    this.cache.clear();
  }
}
