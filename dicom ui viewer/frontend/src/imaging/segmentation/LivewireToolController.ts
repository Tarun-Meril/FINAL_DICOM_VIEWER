/**
 * LivewireToolController Subsystem
 * Intelligent Scissors edge-detection boundary contouring tool
 */

import { IEngineContext } from '../types/contracts';

export class LivewireToolController {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public computePath(startPoint: [number, number], endPoint: [number, number]): Array<[number, number]> {
    return [startPoint, endPoint];
  }
}
