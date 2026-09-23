import { Vector3 } from '../../../3d/math/Vector3';

export class CenterlineEditor {
  public controlPoints: Vector3[] = [];
  private undoStack: Vector3[][] = [];

  public addPoint(point: Vector3): void {
    this.saveState();
    this.controlPoints.push(point.clone());
  }

  public movePoint(index: number, newPos: Vector3): void {
    if (index >= 0 && index < this.controlPoints.length) {
      this.saveState();
      this.controlPoints[index] = newPos.clone();
    }
  }

  public deletePoint(index: number): void {
    if (index >= 0 && index < this.controlPoints.length) {
      this.saveState();
      this.controlPoints.splice(index, 1);
    }
  }

  public undo(): void {
    const prev = this.undoStack.pop();
    if (prev) this.controlPoints = prev;
  }

  private saveState(): void {
    this.undoStack.push(this.controlPoints.map(p => p.clone()));
  }
}
