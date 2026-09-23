/**
 * AIModelRegistry Subsystem
 * Stores metadata for medical AI models (Segmentation, Detection, Classification, LLM, etc.)
 */

import { IAIModelMetadata, IAIModelRegistry, IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class AIModelRegistry implements IAIModelRegistry {
  private engineContext: IEngineContext;
  private models: Map<string, IAIModelMetadata> = new Map();

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public registerModel(model: IAIModelMetadata): void {
    if (!model || !model.modelId) return;
    model.status = 'REGISTERED';
    this.models.set(model.modelId, model);

    this.engineContext.logger.info('AI', `Registered AI Model "${model.name}" v${model.version} (${model.taskType})`);
    this.engineContext.eventBus.emit(EngineEvents.MODEL_REGISTERED, { modelId: model.modelId, name: model.name });
  }

  public getModel(modelId: string): IAIModelMetadata | undefined {
    return this.models.get(modelId);
  }

  public getAllModels(): IAIModelMetadata[] {
    return Array.from(this.models.values());
  }

  public unregisterModel(modelId: string): void {
    this.models.delete(modelId);
  }
}
