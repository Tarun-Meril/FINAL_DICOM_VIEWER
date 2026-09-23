/**
 * AIPipelineBuilder Subsystem
 * Fluid builder for assembling custom modular AI inference pipelines
 */

import { IEngineContext } from '../types/contracts';
import { InferencePipeline } from './InferencePipeline';

export class AIPipelineBuilder {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public build(): InferencePipeline {
    return new InferencePipeline(this.engineContext);
  }
}
