/**
 * GPUResourceManager Subsystem
 * Tracks GPU VRAM allocation, concurrent inference requests, and guards against GPU OOM errors
 */

import { IEngineContext, IGPUResourceManager } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class GPUResourceManager implements IGPUResourceManager {
  private engineContext: IEngineContext;
  private totalMemoryMB: number = 8192;
  private allocatedMemoryMB: number = 0;

  constructor(context: IEngineContext, totalMemoryMB: number = 8192) {
    this.engineContext = context;
    this.totalMemoryMB = totalMemoryMB;
  }

  public allocateMemory(mb: number): boolean {
    if (this.allocatedMemoryMB + mb > this.totalMemoryMB) {
      this.engineContext.logger.warn('AI', `GPU VRAM allocation rejected (${mb}MB requested, ${this.getAvailableMemoryMB()}MB available)`);
      this.engineContext.eventBus.emit(EngineEvents.GPU_MEMORY_WARNING, {
        requestedMB: mb,
        availableMB: this.getAvailableMemoryMB(),
      });
      return false;
    }

    this.allocatedMemoryMB += mb;
    this.engineContext.performanceMonitor.updateGpuMemory(this.allocatedMemoryMB);
    return true;
  }

  public releaseMemory(mb: number): void {
    this.allocatedMemoryMB = Math.max(0, this.allocatedMemoryMB - mb);
    this.engineContext.performanceMonitor.updateGpuMemory(this.allocatedMemoryMB);
  }

  public getAvailableMemoryMB(): number {
    return this.totalMemoryMB - this.allocatedMemoryMB;
  }

  public getTotalMemoryMB(): number {
    return this.totalMemoryMB;
  }
}
