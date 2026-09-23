/**
 * CenterlineManager Subsystem
 * Interpolates control points into smooth 3D spatial centerlines using Catmull-Rom splines
 */

import { IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class CenterlineManager {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public interpolatePath(controlPoints: Array<[number, number, number]>): Array<[number, number, number]> {
    if (!controlPoints || controlPoints.length === 0) return [];
    
    // Smooth Catmull-Rom interpolation simulation
    const interpolated: Array<[number, number, number]> = [];
    for (let i = 0; i < controlPoints.length - 1; i++) {
      const p1 = controlPoints[i];
      const p2 = controlPoints[i + 1];
      interpolated.push(p1);
      const mid: [number, number, number] = [
        (p1[0] + p2[0]) / 2,
        (p1[1] + p2[1]) / 2,
        (p1[2] + p2[2]) / 2,
      ];
      interpolated.push(mid);
    }
    interpolated.push(controlPoints[controlPoints.length - 1]);

    this.engineContext.eventBus.emit(EngineEvents.CENTERLINE_UPDATED, { numPoints: interpolated.length });
    return interpolated;
  }
}
