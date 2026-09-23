export interface GPUMemoryAllocation {
  modelId: string;
  allocatedMb: number;
  gpuDeviceIndex: number;
}

export class GPUResourceManager {
  private totalVramMb = 8192; // 8GB default VRAM allocation pool
  private usedVramMb = 0;
  private allocations = new Map<string, GPUMemoryAllocation>();

  public allocateVram(modelId: string, requiredMb: number): boolean {
    if (this.usedVramMb + requiredMb > this.totalVramMb) return false;
    this.usedVramMb += requiredMb;
    this.allocations.set(modelId, { modelId, allocatedMb: requiredMb, gpuDeviceIndex: 0 });
    return true;
  }

  public freeVram(modelId: string): void {
    const alloc = this.allocations.get(modelId);
    if (alloc) {
      this.usedVramMb = Math.max(0, this.usedVramMb - alloc.allocatedMb);
      this.allocations.delete(modelId);
    }
  }

  public getAvailableVramMb(): number {
    return this.totalVramMb - this.usedVramMb;
  }
}
