/**
 * VesselTrackingManager Subsystem Orchestrator
 * Orchestrates vascular vessel extraction, lumen tracking, and centerline trees
 */

import { IEngineContext, IVesselCenterline, IVesselTrackingManager } from '../types/contracts';
import { EngineEvents } from '../types/events';
import { VesselExtraction } from './VesselExtraction';
import { CenterlineRepository } from './CenterlineRepository';

export class VesselTrackingManager implements IVesselTrackingManager {
  private engineContext: IEngineContext;
  private extraction: VesselExtraction;
  private repository: CenterlineRepository;

  constructor(context: IEngineContext) {
    this.engineContext = context;
    this.extraction = new VesselExtraction(context);
    this.repository = new CenterlineRepository();
  }

  public trackVessel(volumeId: string, seedPoint: [number, number, number]): IVesselCenterline {
    const vesselId = `vessel-${Date.now()}`;
    const { points, radii } = this.extraction.extractCenterline(volumeId, seedPoint);

    const centerline: IVesselCenterline = {
      vesselId,
      label: 'Coronary Artery',
      points,
      radii,
    };

    this.repository.saveCenterline(centerline);
    this.engineContext.logger.info('Vessel', `Tracked vessel ${vesselId} (${points.length} points) from seed point [${seedPoint.join(', ')}]`);
    this.engineContext.eventBus.emit(EngineEvents.VESSEL_TRACKING_COMPLETED, { vesselId, volumeId });

    return centerline;
  }
}
