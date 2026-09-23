/**
 * CornerstoneBootstrap Subsystem Orchestrator
 * Bootstraps Cornerstone Core, Tools, Decoders, Metadata Providers, Loaders, and RenderingEngine Manager
 */

import * as cornerstoneCore from '@cornerstonejs/core';
import {
  init as initCore,
  volumeLoader,
  cornerstoneStreamingImageVolumeLoader,
  cache,
} from '@cornerstonejs/core';
import { init as initTools } from '@cornerstonejs/tools';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';

import { ICornerstoneBootstrap, IEngineConfig, IEngineContext } from '../../types/contracts';
import { EngineEvents } from '../../types/events';
import { registerCustomMetaDataProvider } from '../../metadata/customMetaDataProvider';
import { RenderingEngineManager } from './RenderingEngineManager';

export class CornerstoneBootstrap implements ICornerstoneBootstrap {
  private engineContext: IEngineContext;
  private bootstrapped: boolean = false;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public isBootstrapped(): boolean {
    return this.bootstrapped;
  }

  public async bootstrap(config?: IEngineConfig): Promise<void> {
    if (this.bootstrapped) {
      this.engineContext.logger.warn('Engine', 'CornerstoneBootstrap is already initialized. Skipping duplicate run.');
      return;
    }

    const overallStart = performance.now();
    this.engineContext.eventBus.emit(EngineEvents.ENGINE_INITIALIZING, { timestamp: Date.now() });
    this.engineContext.logger.info('Engine', 'Bootstrapping Cornerstone3D Infrastructure...');

    try {
      // 1. Initialize Cornerstone Core
      const coreStart = performance.now();
      await initCore();
      const coreDuration = performance.now() - coreStart;
      this.engineContext.logger.info('Engine', `Cornerstone Core initialized in ${Math.round(coreDuration)}ms`);
      this.engineContext.eventBus.emit(EngineEvents.CORNERSTONE_INITIALIZED, { durationMs: coreDuration });

      // 2. Initialize Cornerstone Tools
      await initTools();
      this.engineContext.logger.info('Engine', 'Cornerstone Tools initialized');

      // 3. Register Custom Metadata Provider
      const metaStart = performance.now();
      registerCustomMetaDataProvider();
      const metaDuration = performance.now() - metaStart;
      this.engineContext.performanceMonitor.recordInitMetric('metadataRegTimeMs', metaDuration);
      this.engineContext.logger.info('Metadata', `Custom DICOM Metadata Provider registered in ${Math.round(metaDuration)}ms`);
      this.engineContext.eventBus.emit(EngineEvents.METADATA_PROVIDER_REGISTERED, { durationMs: metaDuration });

      // 4. Configure Web Workers & WADO Image Loader
      const loaderStart = performance.now();
      const maxWorkers = config?.maxWebWorkers || Math.min(Math.max((navigator.hardwareConcurrency || 4) - 1, 1), 4);
      
      if (dicomImageLoader.external) {
        dicomImageLoader.external.cornerstone = cornerstoneCore;
        dicomImageLoader.external.dicomParser = dicomParser;
      }
      
      dicomImageLoader.init({
        maxWebWorkers: maxWorkers,
      });

      const workerStartupDuration = performance.now() - loaderStart;
      this.engineContext.performanceMonitor.recordInitMetric('workerStartupTimeMs', workerStartupDuration);
      this.engineContext.logger.info('Loader', `WADO Web Workers pool initialized (${maxWorkers} workers) in ${Math.round(workerStartupDuration)}ms`);
      this.engineContext.eventBus.emit(EngineEvents.WEB_WORKERS_READY, { maxWorkers, durationMs: workerStartupDuration });

      // Register image loader schemes
      cornerstoneCore.imageLoader.registerImageLoader('wadouri', dicomImageLoader.wadouri.loadImage as any);
      cornerstoneCore.imageLoader.registerImageLoader('dicomfile', dicomImageLoader.wadouri.loadImage as any);
      
      const loaderDuration = performance.now() - loaderStart;
      this.engineContext.performanceMonitor.recordInitMetric('loaderRegTimeMs', loaderDuration);
      this.engineContext.logger.info('Loader', 'WADO Image Loaders registered (wadouri, dicomfile)');
      this.engineContext.eventBus.emit(EngineEvents.IMAGE_LOADER_REGISTERED, { durationMs: loaderDuration });

      // 5. Register Volume Loaders
      volumeLoader.registerUnknownVolumeLoader(cornerstoneStreamingImageVolumeLoader as any);
      volumeLoader.registerVolumeLoader('cornerstoneStreamingImageVolume', cornerstoneStreamingImageVolumeLoader as any);
      this.engineContext.logger.info('Volume', 'Cornerstone Streaming Image Volume Loader registered');
      this.engineContext.eventBus.emit(EngineEvents.VOLUME_LOADER_REGISTERED, { timestamp: Date.now() });

      // 6. Configure Cache & Memory limits
      const memoryLimitMB = config?.gpuMemoryLimitMB || 1024;
      cache.setMaxCacheSize(memoryLimitMB * 1024 * 1024);
      this.engineContext.performanceMonitor.updateGpuMemory(0);
      this.engineContext.logger.info('Engine', `Cache max size set to ${memoryLimitMB}MB`);

      // 7. Instantiate RenderingEngineManager Singleton
      const reStart = performance.now();
      const renderingEngineManager = new RenderingEngineManager(this.engineContext);
      renderingEngineManager.getRenderingEngine(); // Instantiate engine instance
      const reDuration = performance.now() - reStart;
      this.engineContext.renderingEngineManager = renderingEngineManager;
      this.engineContext.eventBus.emit(EngineEvents.RENDERING_ENGINE_CREATED, { renderingEngineId: renderingEngineManager.renderingEngineId, durationMs: reDuration });

      // Record total startup metric
      const totalInitDuration = performance.now() - overallStart;
      this.engineContext.performanceMonitor.recordInitMetric('initTimeMs', totalInitDuration);
      this.bootstrapped = true;

      // Update engine state
      this.engineContext.stateStore.updateState({
        initialized: true,
        cornerstoneInitialized: true,
        renderingEngineCreated: true,
      });

      this.engineContext.logger.info('Engine', `Cornerstone Infrastructure Bootstrap complete in ${Math.round(totalInitDuration)}ms`);
      this.engineContext.eventBus.emit(EngineEvents.ENGINE_READY, { totalDurationMs: totalInitDuration });

    } catch (err: any) {
      this.bootstrapped = false;
      this.engineContext.logger.error('Engine', 'Failed to bootstrap Cornerstone Infrastructure', err);
      this.engineContext.eventBus.emit(EngineEvents.ENGINE_ERROR, {
        module: 'CornerstoneBootstrap',
        message: err.message || 'Cornerstone initialization failed',
        error: err,
        timestamp: Date.now(),
      });
      throw err;
    }
  }

  public async destroy(): Promise<void> {
    if (!this.bootstrapped) return;

    this.engineContext.eventBus.emit(EngineEvents.ENGINE_DESTROYING, { timestamp: Date.now() });
    this.engineContext.logger.info('Engine', 'Tearing down Cornerstone Infrastructure...');

    try {
      // 1. Destroy RenderingEngine Manager
      if (this.engineContext.renderingEngineManager) {
        this.engineContext.renderingEngineManager.destroy();
        this.engineContext.renderingEngineManager = undefined;
      }

      // 2. Clear Cornerstone Cache
      cache.purgeCache();
      this.engineContext.logger.info('Engine', 'Cornerstone cache purged');

      this.bootstrapped = false;
      this.engineContext.stateStore.updateState({
        initialized: false,
        cornerstoneInitialized: false,
        renderingEngineCreated: false,
      });

      this.engineContext.logger.info('Engine', 'Cornerstone Infrastructure tear-down complete');
      this.engineContext.eventBus.emit(EngineEvents.ENGINE_DESTROYED, { timestamp: Date.now() });

    } catch (err: any) {
      this.engineContext.logger.error('Engine', 'Error during Cornerstone Infrastructure destroy', err);
      this.engineContext.eventBus.emit(EngineEvents.ENGINE_ERROR, {
        module: 'CornerstoneBootstrap',
        message: err.message || 'Cornerstone destroy failed',
        error: err,
        timestamp: Date.now(),
      });
    }
  }
}
