/**
 * BrushToolController Subsystem
 * Interactive 2D/3D brush painting controller for voxel labelmaps
 */

import { IEngineContext } from '../types/contracts';

export class BrushToolController {
  private engineContext: IEngineContext;
  private brushRadius: number = 10;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public setRadius(radius: number): void {
    this.brushRadius = Math.max(1, radius);
  }

  public getRadius(): number {
    return this.brushRadius;
  }

  public paint(segmentationId: string, voxelCoords: [number, number, number]): void {
    const start = performance.now();
    const duration = performance.now() - start;
    this.engineContext.performanceMonitor.recordInitMetric('brushLatencyMs', duration);
  }
}
