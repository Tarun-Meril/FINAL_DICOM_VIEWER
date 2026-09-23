/**
 * AIPlatform Infrastructure Subsystem Facade Entry Point
 * Enterprise AI Infrastructure platform for registering, executing, and retrieving AI clinical models
 */

import { IAIJob, IAIModelMetadata, IAIPlatform, IEngineContext } from '../types/contracts';

export class AIPlatform implements IAIPlatform {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public registerModel(model: IAIModelMetadata): void {
    if (this.engineContext.aiModelRegistry) {
      this.engineContext.aiModelRegistry.registerModel(model);
    }
  }

  public async runInference(modelId: string, targetId: string): Promise<IAIJob> {
    if (!this.engineContext.aiJobManager) {
      throw new Error('[AIPlatform] AIJobManager is not initialized');
    }
    return this.engineContext.aiJobManager.createJob(modelId, targetId);
  }

  public getJob(jobId: string): IAIJob | undefined {
    return this.engineContext.aiJobManager?.getJob(jobId);
  }

  public getResults(targetId: string): any {
    return this.engineContext.aiResultRepository?.getResult(targetId);
  }
}
