/**
 * VolumeFactory Subsystem
 * Factory for instantiating streaming, labelmap, segmentation, and fusion volumes
 */

import { IEngineContext, IVolumeDescriptor, IVolumeFactory } from '../types/contracts';
import { DisplaySet } from '../domain/entities/DicomEntities';
import { VolumeBuilder } from './VolumeBuilder';

export class VolumeFactory implements IVolumeFactory {
  private engineContext: IEngineContext;
  private volumeBuilder: VolumeBuilder;

  constructor(context: IEngineContext) {
    this.engineContext = context;
    this.volumeBuilder = new VolumeBuilder(context);
  }

  public createStreamingVolume(displaySet: DisplaySet): IVolumeDescriptor {
    const descriptor = this.volumeBuilder.buildVolumeDescriptor(displaySet);
    this.engineContext.volumeRepository?.addVolume(descriptor);
    this.engineContext.volumeCacheManager?.trackVolumeUsage(descriptor.volumeId, descriptor.sizeMB);
    return descriptor;
  }
}
