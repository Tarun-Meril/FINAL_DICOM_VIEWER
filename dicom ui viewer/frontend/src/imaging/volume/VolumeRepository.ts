/**
 * VolumeRepository Store Tracker
 * In-memory repository for storing and querying active Volume Descriptors
 */

import { IEngineContext, IVolumeDescriptor, IVolumeRepository } from '../types/contracts';

export class VolumeRepository implements IVolumeRepository {
  private engineContext: IEngineContext;
  private volumeMap: Map<string, IVolumeDescriptor> = new Map();

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public addVolume(descriptor: IVolumeDescriptor): void {
    if (!descriptor || !descriptor.volumeId) return;
    this.volumeMap.set(descriptor.volumeId, descriptor);
    this.engineContext.logger.debug('Volume', `Volume ${descriptor.volumeId} stored in VolumeRepository`);
  }

  public getVolume(volumeId: string): IVolumeDescriptor | undefined {
    return this.volumeMap.get(volumeId);
  }

  public getAllVolumes(): IVolumeDescriptor[] {
    return Array.from(this.volumeMap.values());
  }

  public removeVolume(volumeId: string): void {
    this.volumeMap.delete(volumeId);
    this.engineContext.logger.debug('Volume', `Volume ${volumeId} removed from VolumeRepository`);
  }

  public clear(): void {
    this.volumeMap.clear();
    this.engineContext.logger.debug('Volume', 'VolumeRepository cleared');
  }
}
