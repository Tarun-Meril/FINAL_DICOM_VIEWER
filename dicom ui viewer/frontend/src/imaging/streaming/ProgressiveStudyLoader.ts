/**
 * ProgressiveStudyLoader Subsystem
 * Progressive WADO-RS study loading with metadata first, middle slice priority, and lazy frame loading
 */

import { IEngineContext } from '../types/contracts';

export class ProgressiveStudyLoader {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public async loadStudyProgressively(studyInstanceUid: string): Promise<void> {
    this.engineContext.logger.info('Streaming', `ProgressiveStudyLoader initiating streaming for ${studyInstanceUid}`);
    if (this.engineContext.streamingManager) {
      await this.engineContext.streamingManager.startProgressiveStream(studyInstanceUid);
    }
  }
}
