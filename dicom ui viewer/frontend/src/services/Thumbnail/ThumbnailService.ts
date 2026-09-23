import { ThumbnailRenderer } from './ThumbnailRenderer';
import { ThumbnailGenerator } from './ThumbnailGenerator';
import { ThumbnailCache, CacheConfig } from './ThumbnailCache';
import { ThumbnailQueue, ThumbnailPriority } from './ThumbnailQueue';
import { RepresentativeSliceSelector } from './RepresentativeSliceSelector';
import { WindowLevelStrategy } from './WindowLevelStrategy';
import { ThumbnailMetrics } from './ThumbnailMetrics';
import * as cornerstoneCore from '@cornerstonejs/core';

export enum ThumbnailStatus {
  Idle,
  Queued,
  Rendering,
  Encoding,
  Caching,
  Ready,
  Failed
}

export { ThumbnailPriority };

export interface ThumbnailRequest {
  id: string;
  studyUID: string;
  seriesUID: string;
  imageIds?: string[];
  fetchImageIds?: () => Promise<string[]>;
  modality?: string;
  config: CacheConfig;
  priority: ThumbnailPriority;
  onStatusChange: (status: ThumbnailStatus, url?: string) => void;
}

class ThumbnailServiceClass {
  private renderer: ThumbnailRenderer;
  private generator: ThumbnailGenerator;
  private cache: ThumbnailCache;
  private queue: ThumbnailQueue;
  private selector: RepresentativeSliceSelector;
  public metrics: ThumbnailMetrics;

  constructor() {
    this.renderer = new ThumbnailRenderer();
    this.generator = new ThumbnailGenerator(this.renderer);
    this.cache = new ThumbnailCache();
    this.queue = new ThumbnailQueue();
    this.selector = new RepresentativeSliceSelector();
    this.metrics = new ThumbnailMetrics();
  }

  public getThumbnail(request: ThumbnailRequest): void {
    if ((!request.imageIds || request.imageIds.length === 0) && !request.fetchImageIds) {
      request.onStatusChange(ThumbnailStatus.Failed);
      return;
    }

    const presetName = WindowLevelStrategy.getConfigForModality(request.modality).presetName;
    const cacheKey = this.cache.generateKey(request.studyUID, request.seriesUID, presetName, request.config);

    // 1. Check Memory Cache
    const memUrl = this.cache.getFromMemory(cacheKey);
    if (memUrl) {
      this.metrics.logCacheHitMemory();
      request.onStatusChange(ThumbnailStatus.Ready, memUrl);
      return;
    }

    // Prepare generation task
    const executeTask = async () => {
      try {
        // 2. Check IndexedDB
        request.onStatusChange(ThumbnailStatus.Caching);
        const dbUrl = await this.cache.getFromIndexedDB(cacheKey);
        if (dbUrl) {
          this.metrics.logCacheHitDB();
          request.onStatusChange(ThumbnailStatus.Ready, dbUrl);
          return;
        }

        this.metrics.logCacheMiss();

        // 3. Ensure we have imageIds
        let currentImageIds = request.imageIds;
        if ((!currentImageIds || currentImageIds.length === 0) && request.fetchImageIds) {
          try {
            currentImageIds = await request.fetchImageIds();
          } catch (e) {
            throw new Error(`Failed to fetch imageIds for ${request.seriesUID}`);
          }
        }
        
        if (!currentImageIds || currentImageIds.length === 0) {
          throw new Error('No imageIds provided and fetchImageIds failed or not provided');
        }

        // 4. Selection
        const selectedImageId = this.selector.select(currentImageIds, { modality: request.modality });
        if (!selectedImageId) throw new Error('No representative slice found');

        // 5. Render
        request.onStatusChange(ThumbnailStatus.Rendering);
        const startTime = performance.now();
        const metadata = cornerstoneCore.metaData.get('voiLutModule', selectedImageId);
        const viewportConfig = WindowLevelStrategy.getConfigForModality(request.modality, metadata);
        
        // 6. Encode
        request.onStatusChange(ThumbnailStatus.Encoding);
        const blob = await this.generator.generate(selectedImageId, viewportConfig, request.config);
        
        this.metrics.logRenderTime(performance.now() - startTime);

        // 6. Cache and return
        request.onStatusChange(ThumbnailStatus.Caching);
        const url = await this.cache.store(cacheKey, blob);
        
        request.onStatusChange(ThumbnailStatus.Ready, url);

      } catch (err) {
        console.error('[ThumbnailService] Generation failed:', err);
        request.onStatusChange(ThumbnailStatus.Failed);
      }
    };

    // Enqueue task
    request.onStatusChange(ThumbnailStatus.Queued);
    this.queue.enqueue({
      id: request.id,
      studyUID: request.studyUID,
      seriesUID: request.seriesUID,
      priority: request.priority,
      execute: executeTask
    });
  }

  public cancelByStudyUID(studyUID: string) {
    this.queue.cancelByStudyUID(studyUID);
  }

  public cancelRequest(requestId: string) {
    this.queue.cancelById(requestId);
  }

  public releaseThumbnail(studyUID: string, seriesUID: string, modality: string, config: CacheConfig) {
    const presetName = WindowLevelStrategy.getConfigForModality(modality).presetName;
    const cacheKey = this.cache.generateKey(studyUID, seriesUID, presetName, config);
    this.cache.release(cacheKey);
  }
}

export const ThumbnailService = new ThumbnailServiceClass();
