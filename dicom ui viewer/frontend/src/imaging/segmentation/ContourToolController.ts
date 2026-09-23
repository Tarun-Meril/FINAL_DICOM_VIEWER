/**
 * ContourToolController Subsystem
 * Manual polygon, spline, open, and closed contour ROI tool controller
 */

import { IEngineContext } from '../types/contracts';

export class ContourToolController {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public createContour(points: Array<[number, number, number]>, closed: boolean = true): void {
    this.engineContext.logger.debug('Segmentation', `Created ${closed ? 'closed' : 'open'} contour with ${points.length} control points`);
  }
}
