import { Logger, LogCategory } from '../../shared/Logger';
import { cache } from '@cornerstonejs/core';

class VolumeCacheImpl {
  private activeVolumeIds: Set<string> = new Set();

  registerVolumeId(volumeId: string) {
    this.activeVolumeIds.add(volumeId);
    Logger.info(LogCategory.GENERAL, `[VolumeCache] Registered volume ID: ${volumeId}`);
  }

  purgeAll() {
    this.activeVolumeIds.forEach(volId => {
      try {
        cache.removeVolume(volId);
        Logger.info(LogCategory.GENERAL, `[VolumeCache] Purged volume: ${volId}`);
      } catch (e) {
        Logger.error(LogCategory.GENERAL, `[VolumeCache] Error purging volume: ${volId}`, e);
      }
    });
    this.activeVolumeIds.clear();
  }
}

export const VolumeCache = new VolumeCacheImpl();
