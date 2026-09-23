/**
 * FusionManager Subsystem Orchestrator
 * Orchestrates multi-volume PET/CT, CT/MR fusion sessions and overlay color/opacity blending
 */

import { IEngineContext, IFusionManager, IFusionSession } from '../types/contracts';
import { EngineEvents } from '../types/events';
import { BlendModeManager } from './BlendModeManager';
import { ColorMapManager } from './ColorMapManager';
import { OpacityManager } from './OpacityManager';
import { MultiVolumeManager } from './MultiVolumeManager';

export class FusionManager implements IFusionManager {
  private engineContext: IEngineContext;
  private fusions: Map<string, IFusionSession> = new Map();
  private blendModeManager: BlendModeManager;
  private colorMapManager: ColorMapManager;
  private opacityManager: OpacityManager;
  private multiVolumeManager: MultiVolumeManager;

  constructor(context: IEngineContext) {
    this.engineContext = context;
    this.blendModeManager = new BlendModeManager(context);
    this.colorMapManager = new ColorMapManager(context);
    this.opacityManager = new OpacityManager();
    this.multiVolumeManager = new MultiVolumeManager(context);
  }

  public createFusion(referenceVolumeId: string, overlayVolumeId: string): IFusionSession {
    const fusionId = `fusion-${Date.now()}`;
    const session: IFusionSession = {
      fusionId,
      referenceVolumeId,
      overlayVolumeId,
      blendMode: 'ALPHA',
      opacity: 0.5,
      colorMap: 'PET-HotIron',
    };

    this.fusions.set(fusionId, session);
    this.multiVolumeManager.alignVolumes(referenceVolumeId, overlayVolumeId);

    this.engineContext.logger.info('Fusion', `Created Fusion session ${fusionId} (${overlayVolumeId} on ${referenceVolumeId})`);
    this.engineContext.eventBus.emit(EngineEvents.FUSION_CREATED, { fusionId, referenceVolumeId, overlayVolumeId });

    return session;
  }

  public setBlendMode(fusionId: string, mode: 'ALPHA' | 'MAXIMUM_INTENSITY' | 'DIFFERENCE' | 'OVERLAY'): void {
    const session = this.fusions.get(fusionId);
    if (session) {
      session.blendMode = mode;
      this.blendModeManager.setBlendMode(mode);
    }
  }

  public setOpacity(fusionId: string, opacity: number): void {
    const session = this.fusions.get(fusionId);
    if (session) {
      session.opacity = opacity;
      this.opacityManager.setOpacity(opacity);
    }
  }

  public setColorMap(fusionId: string, colorMap: string): void {
    const session = this.fusions.get(fusionId);
    if (session) {
      session.colorMap = colorMap;
      this.colorMapManager.setColorMap(colorMap);
    }
  }
}
