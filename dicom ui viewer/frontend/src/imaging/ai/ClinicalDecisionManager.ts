/**
 * ClinicalDecisionManager Subsystem
 * Clinical decision support rules engine for triggering critical alert escalations
 */

import { IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class ClinicalDecisionManager {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public evaluateCriticalFinding(findingLabel: string, studyUid: string): void {
    if (findingLabel.toLowerCase().includes('hemorrhage') || findingLabel.toLowerCase().includes('fracture')) {
      this.engineContext.logger.warn('AI', `CRITICAL FINDING DETECTED: "${findingLabel}" in study ${studyUid}`);
      this.engineContext.eventBus.emit(EngineEvents.CRITICAL_FINDING_ALERT, { findingLabel, studyUid });
    }
  }
}
