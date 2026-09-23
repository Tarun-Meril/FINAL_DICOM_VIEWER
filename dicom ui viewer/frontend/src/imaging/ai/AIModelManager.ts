/**
 * AIModelManager Subsystem
 * Manages model loading, unloading, reloading, and GPU VRAM lifecycle
 */

import { IAIModelManager, IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class AIModelManager implements IAIModelManager {
  private engineContext: IEngineContext;
  private loadedModels: Set<string> = new Set();

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public async loadModel(modelId: string): Promise<void> {
    const model = this.engineContext.aiModelRegistry?.getModel(modelId);
    if (!model) {
      throw new Error(`[AIModelManager] Model ${modelId} is not registered`);
    }

    const start = performance.now();
    const allocated = this.engineContext.gpuResourceManager?.allocateMemory(model.gpuMemoryMB || 512);
    if (!allocated) {
      throw new Error(`[AIModelManager] Insufficient GPU VRAM to load model ${modelId}`);
    }

    this.loadedModels.add(modelId);
    model.status = 'LOADED';

    const duration = performance.now() - start;
    this.engineContext.performanceMonitor.recordInitMetric('aiModelLoadTimeMs', duration);
    this.engineContext.logger.info('AI', `Loaded AI Model ${modelId} into GPU VRAM in ${Math.round(duration)}ms`);

    this.engineContext.eventBus.emit(EngineEvents.MODEL_LOADED, { modelId });
  }

  public async unloadModel(modelId: string): Promise<void> {
    const model = this.engineContext.aiModelRegistry?.getModel(modelId);
    if (model && this.loadedModels.has(modelId)) {
      this.engineContext.gpuResourceManager?.releaseMemory(model.gpuMemoryMB || 512);
      this.loadedModels.delete(modelId);
      model.status = 'UNLOADED';

      this.engineContext.logger.info('AI', `Unloaded AI Model ${modelId} from GPU VRAM`);
      this.engineContext.eventBus.emit(EngineEvents.MODEL_UNLOADED, { modelId });
    }
  }

  public isModelLoaded(modelId: string): boolean {
    return this.loadedModels.has(modelId);
  }
}
