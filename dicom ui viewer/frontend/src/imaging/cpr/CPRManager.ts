/**
 * CPRManager Subsystem Orchestrator
 * Orchestrates Curved Planar Reformation (CPR) paths and curved slice generation
 */

import { ICPRManager, ICPRPath, IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';
import { CenterlineManager } from './CenterlineManager';
import { CurvedSliceGenerator } from './CurvedSliceGenerator';

export class CPRManager implements ICPRManager {
  private engineContext: IEngineContext;
  private centerlineManager: CenterlineManager;
  private sliceGenerator: CurvedSliceGenerator;

  constructor(context: IEngineContext) {
    this.engineContext = context;
    this.centerlineManager = new CenterlineManager(context);
    this.sliceGenerator = new CurvedSliceGenerator(context);
  }

  public generateCPR(volumeId: string, controlPoints: Array<[number, number, number]>): ICPRPath {
    const cprId = `cpr-${Date.now()}`;
    const interpolated = this.centerlineManager.interpolatePath(controlPoints);
    this.sliceGenerator.generateCurvedSlice(volumeId, interpolated);

    const cprPath: ICPRPath = {
      cprId,
      volumeId,
      controlPoints: interpolated,
    };

    this.engineContext.logger.info('CPR', `Generated CPR path ${cprId} with ${interpolated.length} points for volume ${volumeId}`);
    this.engineContext.eventBus.emit(EngineEvents.CPR_CREATED, { cprId, volumeId });

    return cprPath;
  }
}
