import { Logger, LogCategory } from '../shared/Logger';

export interface IVolume {
  id: string;
  type: string;
  cornerstoneVolume: any; // Type generic for now
}

class VolumeRegistryImpl {
  private volumes: Map<string, IVolume> = new Map();

  register(volume: IVolume): void {
    if (this.volumes.has(volume.id)) {
      Logger.warn(LogCategory.GENERAL, `[VolumeRegistry] Overwriting existing volume: ${volume.id}`);
    }
    this.volumes.set(volume.id, volume);
    Logger.info(LogCategory.GENERAL, `[VolumeRegistry] Registered volume: ${volume.id}`);
  }

  get(id: string): IVolume | undefined {
    return this.volumes.get(id);
  }

  remove(id: string): void {
    if (this.volumes.has(id)) {
      this.volumes.delete(id);
      Logger.info(LogCategory.GENERAL, `[VolumeRegistry] Removed volume: ${id}`);
    }
  }

  clear(): void {
    this.volumes.clear();
    Logger.info(LogCategory.GENERAL, `[VolumeRegistry] Cleared all volumes`);
  }
}

export const VolumeRegistry = new VolumeRegistryImpl();
