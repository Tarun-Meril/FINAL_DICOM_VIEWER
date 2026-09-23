import { Logger, LogCategory } from '../../shared/Logger';
import { cache } from '@cornerstonejs/core';

class GPUResourceManagerImpl {
  releaseResources() {
    Logger.info(LogCategory.GPU, `[GPUResourceManager] Releasing all GPU resources`);
    try {
      cache.purgeCache();
    } catch (e) {
      Logger.error(LogCategory.GPU, `[GPUResourceManager] Error purging Cornerstone cache`, e);
    }
  }

  logDiagnostics() {
    const cacheSize = cache.getCacheSize();
    Logger.debug(LogCategory.GPU, `[GPUResourceManager] Cache Size: ${cacheSize} bytes`);
  }
}

export const GPUResourceManager = new GPUResourceManagerImpl();
