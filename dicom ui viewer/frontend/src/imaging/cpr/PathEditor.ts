/**
 * PathEditor Subsystem
 * Interactive editing of centerline control points (Add, Move, Delete control points)
 */

export class PathEditor {
  private controlPoints: Array<[number, number, number]> = [];

  public addControlPoint(point: [number, number, number]): void {
    this.controlPoints.push(point);
  }

  public getControlPoints(): Array<[number, number, number]> {
    return [...this.controlPoints];
  }
}
