/**
 * CPRViewportController Subsystem
 * Viewport controller for Straightened and Stretched CPR views
 */

import { IEngineContext } from '../types/contracts';

export class CPRViewportController {
  public readonly viewportId: string;
  private engineContext: IEngineContext;

  constructor(viewportId: string, context: IEngineContext) {
    this.viewportId = viewportId;
    this.engineContext = context;
  }

  public renderCPR(): void {
    this.engineContext.logger.debug('CPR', `Rendering CPR Viewport ${this.viewportId}`);
  }
}
