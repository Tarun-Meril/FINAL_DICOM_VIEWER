/**
 * Performance Telemetry & Performance Monitoring Service
 */

import { IPerformanceMetrics, IPerformanceMonitor } from '../types/contracts';

export class PerformanceMonitor implements IPerformanceMonitor {
  private metrics: IPerformanceMetrics = {
    fps: 60,
    gpuMemoryUsageMB: 0,
    lastRenderTimeMs: 0,
    volumeLoadTimeMs: 0,
    metadataParseTimeMs: 0,
    workerQueueDepth: 0,
  };

  public recordRenderTime(durationMs: number): void {
    this.metrics.lastRenderTimeMs = Math.round(durationMs * 100) / 100;
  }

  public recordVolumeLoadTime(durationMs: number): void {
    this.metrics.volumeLoadTimeMs = Math.round(durationMs);
  }

  public recordMetadataParseTime(durationMs: number): void {
    this.metrics.metadataParseTimeMs = Math.round(durationMs);
  }

  public updateFps(fps: number): void {
    this.metrics.fps = Math.round(fps);
  }

  public updateGpuMemory(mb: number): void {
    this.metrics.gpuMemoryUsageMB = Math.round(mb * 10) / 10;
  }

  public updateWorkerQueueDepth(depth: number): void {
    this.metrics.workerQueueDepth = Math.max(0, depth);
  }

  public getMetrics(): Readonly<IPerformanceMetrics> {
    return Object.freeze({ ...this.metrics });
  }
}
