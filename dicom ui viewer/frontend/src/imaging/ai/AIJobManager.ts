/**
 * AIJobManager Subsystem Orchestrator
 * Manages background AI job states (QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED)
 */

import { IAIJob, IAIJobManager, IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';
import { InferencePipeline } from './InferencePipeline';

export class AIJobManager implements IAIJobManager {
  private engineContext: IEngineContext;
  private jobs: Map<string, IAIJob> = new Map();
  private pipeline: InferencePipeline;

  constructor(context: IEngineContext) {
    this.engineContext = context;
    this.pipeline = new InferencePipeline(context);
  }

  public createJob(modelId: string, targetId: string): IAIJob {
    const jobId = `job-${Date.now()}`;
    const job: IAIJob = {
      jobId,
      modelId,
      targetId,
      status: 'QUEUED',
      progressPercent: 0,
      startTime: Date.now(),
    };

    this.jobs.set(jobId, job);
    this.engineContext.logger.info('AI', `Created AI Job ${jobId} (Model: ${modelId}, Target: ${targetId})`);

    // Asynchronously execute pipeline
    setTimeout(async () => {
      try {
        job.status = 'RUNNING';
        job.progressPercent = 10;
        this.engineContext.eventBus.emit(EngineEvents.INFERENCE_STARTED, { jobId, modelId, targetId });

        // Lazy load model if needed
        if (!this.engineContext.aiModelManager?.isModelLoaded(modelId)) {
          await this.engineContext.aiModelManager?.loadModel(modelId);
        }

        job.progressPercent = 50;
        this.engineContext.eventBus.emit(EngineEvents.INFERENCE_PROGRESS, { jobId, progressPercent: 50 });

        const result = await this.pipeline.executePipeline(modelId, targetId);
        job.result = result;
        job.status = 'COMPLETED';
        job.progressPercent = 100;
        job.endTime = Date.now();

        this.engineContext.aiResultRepository?.saveResult(targetId, result);
        this.engineContext.logger.info('AI', `AI Job ${jobId} completed successfully`);

        this.engineContext.eventBus.emit(EngineEvents.INFERENCE_COMPLETED, { jobId, result });
      } catch (err: any) {
        job.status = 'FAILED';
        job.error = err.message;
        this.engineContext.logger.error('AI', `AI Job ${jobId} failed: ${err.message}`, err);

        this.engineContext.eventBus.emit(EngineEvents.INFERENCE_FAILED, { jobId, error: err.message });
        this.engineContext.eventBus.emit(EngineEvents.ENGINE_ERROR, {
          module: 'AIJobManager',
          message: err.message,
          error: err,
          timestamp: Date.now(),
        });
      }
    }, 0);

    return job;
  }

  public cancelJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job && (job.status === 'QUEUED' || job.status === 'RUNNING')) {
      job.status = 'CANCELLED';
      this.engineContext.logger.info('AI', `Cancelled AI Job ${jobId}`);
      this.engineContext.eventBus.emit(EngineEvents.JOB_CANCELLED, { jobId });
    }
  }

  public getJob(jobId: string): IAIJob | undefined {
    return this.jobs.get(jobId);
  }

  public getAllJobs(): IAIJob[] {
    return Array.from(this.jobs.values());
  }
}
