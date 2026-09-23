/**
 * VolumeCacheManager Subsystem
 * LRU Memory Cache Tracker and GPU/CPU Eviction Manager
 */

import { IEngineContext, IVolumeCacheManager } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class VolumeCacheManager implements IVolumeCacheManager {
  private engineContext: IEngineContext;
  private maxMemoryLimitMB: number = 1024;
  private volumeAccessTimes: Map<string, number> = new Map();
  private volumeSizesMB: Map<string, number> = new Map();

  constructor(context: IEngineContext, maxMemoryLimitMB: number = 1024) {
    this.engineContext = context;
    this.maxMemoryLimitMB = maxMemoryLimitMB;
  }

  public setMaxMemoryLimitMB(limitMB: number): void {
    this.maxMemoryLimitMB = limitMB;
    this.engineContext.logger.info('Volume', `Max GPU/CPU volume memory limit set to ${limitMB}MB`);
  }

  public trackVolumeUsage(volumeId: string, sizeMB: number): void {
    this.volumeAccessTimes.set(volumeId, Date.now());
    this.volumeSizesMB.set(volumeId, sizeMB);

    const totalUsage = this.getCurrentMemoryUsageMB();
    this.engineContext.performanceMonitor.updateGpuMemory(Math.round(totalUsage));

    if (totalUsage > this.maxMemoryLimitMB) {
      this.engineContext.logger.warn('Volume', `Volume memory threshold exceeded (${Math.round(totalUsage)}MB / ${this.maxMemoryLimitMB}MB). Triggering LRU eviction...`);
      this.evictLruVolume();
    }
  }

  public evictLruVolume(): string | undefined {
    let oldestVolumeId: string | undefined;
    let oldestTime = Infinity;

    for (const [volumeId, time] of this.volumeAccessTimes.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestVolumeId = volumeId;
      }
    }

    if (oldestVolumeId) {
      this.volumeAccessTimes.delete(oldestVolumeId);
      this.volumeSizesMB.delete(oldestVolumeId);

      this.engineContext.volumeRepository?.removeVolume(oldestVolumeId);
      this.engineContext.logger.info('Volume', `LRU Evicted Volume: ${oldestVolumeId}`);

      this.engineContext.eventBus.emit(EngineEvents.VOLUME_EVICTED, { volumeId: oldestVolumeId });
      this.engineContext.eventBus.emit(EngineEvents.CACHE_EVICTED, { volumeId: oldestVolumeId });
    }

    return oldestVolumeId;
  }

  public getCurrentMemoryUsageMB(): number {
    let total = 0;
    for (const size of this.volumeSizesMB.values()) {
      total += size;
    }
    return total;
  }

  public clearCache(): void {
    this.volumeAccessTimes.clear();
    this.volumeSizesMB.clear();
    this.engineContext.performanceMonitor.updateGpuMemory(0);
    this.engineContext.logger.info('Volume', 'VolumeCacheManager purged');
  }
}
