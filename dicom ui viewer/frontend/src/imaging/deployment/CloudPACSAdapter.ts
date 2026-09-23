/**
 * CloudPACSAdapter Subsystem
 * Cloud PACS DICOMweb REST & WebSocket gateway adapter
 */

import { IEngineContext } from '../types/contracts';

export class CloudPACSAdapter {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public connectCloudPACS(endpointUrl: string): void {
    this.engineContext.logger.info('Deployment', `Connected Cloud PACS gateway adapter to ${endpointUrl}`);
  }
}
