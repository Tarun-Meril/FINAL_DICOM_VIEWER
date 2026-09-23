/**
 * LODManager Subsystem
 * Dynamic Level-of-Detail (LOD) resolution switching for 2D images and 3D volumes
 */

import { IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class LODManager {
  private engineContext: IEngineContext;
  private currentLod: number = 0; // 0 = Full resolution, 1 = Half, 2 = Quarter

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public setLOD(lod: number): void {
    this.currentLod = lod;
    this.engineContext.logger.debug('Rendering', `LOD changed to level ${lod}`);
    this.engineContext.eventBus.emit(EngineEvents.LOD_CHANGED, { lod });
  }

  public getLOD(): number {
    return this.currentLod;
  }
}
