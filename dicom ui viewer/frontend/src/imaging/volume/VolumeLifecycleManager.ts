/**
 * VolumeLifecycleManager Subsystem
 * Orchestrates volume creation, Cornerstone volumeLoader streaming, caching, and teardown
 */

import { volumeLoader } from '@cornerstonejs/core';
import { IEngineContext, IVolumeDescriptor, IVolumeLifecycleManager } from '../types/contracts';
import { EngineEvents } from '../types/events';
import { DisplaySet } from '../domain/entities/DicomEntities';
import { VolumeFactory } from './VolumeFactory';

export class VolumeLifecycleManager implements IVolumeLifecycleManager {
  private engineContext: IEngineContext;
  private volumeFactory: VolumeFactory;

  constructor(context: IEngineContext) {
    this.engineContext = context;
    this.volumeFactory = new VolumeFactory(context);
  }

  public async createAndLoadVolume(displaySet: DisplaySet): Promise<IVolumeDescriptor> {
    if (!displaySet || !displaySet.imageIds || displaySet.imageIds.length === 0) {
      throw new Error('[VolumeLifecycleManager] Cannot create volume from invalid DisplaySet');
    }

    const descriptor = this.volumeFactory.createStreamingVolume(displaySet);
    const { volumeId, imageIds } = descriptor;

    this.engineContext.logger.info('Volume', `Loading streaming volume ${volumeId} (${imageIds.length} slices)...`);
    this.engineContext.eventBus.emit(EngineEvents.VOLUME_LOADING, { volumeId });

    const start = performance.now();

    try {
      // Create and cache volume in Cornerstone core loader
      const csVolume = await volumeLoader.createAndCacheVolume(volumeId, {
        imageIds,
      });

      // Trigger volume streaming download
      if (csVolume && typeof (csVolume as any).load === 'function') {
        (csVolume as any).load();
      }

      const duration = performance.now() - start;
      this.engineContext.performanceMonitor.recordVolumeLoadTime(duration);
      this.engineContext.logger.info('Volume', `Streaming volume ${volumeId} loaded in ${Math.round(duration)}ms`);

      this.engineContext.eventBus.emit(EngineEvents.VOLUME_LOADED, {
        volumeId,
        dimensions: descriptor.dimensions,
        spacing: descriptor.spacing,
        sizeMB: descriptor.sizeMB,
        voxelCount: descriptor.voxelCount,
      });

      this.engineContext.eventBus.emit(EngineEvents.VOLUME_CACHED, { volumeId });

      // Update engine state
      const activeVols = this.engineContext.stateStore.getState().activeVolumes;
      if (!activeVols.includes(volumeId)) {
        this.engineContext.stateStore.updateState({ activeVolumes: [...activeVols, volumeId] });
      }

      return descriptor;
    } catch (err: any) {
      this.engineContext.logger.error('Volume', `Failed creating and loading volume ${volumeId}`, err);
      this.engineContext.eventBus.emit(EngineEvents.ENGINE_ERROR, {
        module: 'VolumeLifecycleManager',
        message: err.message || 'Volume creation/load failed',
        error: err,
        timestamp: Date.now(),
      });
      throw err;
    }
  }

  public async unloadVolume(volumeId: string): Promise<void> {
    this.engineContext.logger.info('Volume', `Unloading volume ${volumeId}`);
    try {
      this.engineContext.volumeRepository?.removeVolume(volumeId);
      const activeVols = this.engineContext.stateStore.getState().activeVolumes.filter((v) => v !== volumeId);
      this.engineContext.stateStore.updateState({ activeVolumes: activeVols });
      this.engineContext.eventBus.emit(EngineEvents.VOLUME_EVICTED, { volumeId });
    } catch (err: any) {
      this.engineContext.logger.error('Volume', `Error unloading volume ${volumeId}`, err);
    }
  }
}
