/**
 * GPUMemoryManager Subsystem
 * GPU Texture memory, Volume memory, Labelmap VRAM, and Transfer Function memory cleanup manager
 */

import { IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class GPUMemoryManager {
  private engineContext: IEngineContext;
  private allocatedMB: number = 0;
  private maxLimitMB: number = 4096;

  constructor(context: IEngineContext, maxLimitMB: number = 4096) {
    this.engineContext = context;
    this.maxLimitMB = maxLimitMB;
  }

  public allocateTexture(mb: number): boolean {
    if (this.allocatedMB + mb > this.maxLimitMB) {
      this.engineContext.eventBus.emit(EngineEvents.GPU_MEMORY_WARNING, { allocatedMB: this.allocatedMB, maxLimitMB: this.maxLimitMB });
      return false;
    }
    this.allocatedMB += mb;
    return true;
  }

  public freeTexture(mb: number): void {
    this.allocatedMB = Math.max(0, this.allocatedMB - mb);
  }
}
