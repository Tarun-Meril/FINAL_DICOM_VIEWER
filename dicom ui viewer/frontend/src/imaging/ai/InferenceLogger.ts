/**
 * InferenceLogger Subsystem
 * Specialized logger for tracking AI model loading, inference latency, and GPU allocations
 */

import { IEngineContext } from '../types/contracts';

export class InferenceLogger {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public info(message: string, data?: any): void {
    this.engineContext.logger.info('AI', message, data);
  }

  public error(message: string, error?: Error): void {
    this.engineContext.logger.error('AI', message, error);
  }
}
