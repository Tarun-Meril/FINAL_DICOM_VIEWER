import { Vector3 } from '../../../3d/math/Vector3';

export class FlyThroughEngine {
  public isFlying = false;
  public currentPointIndex = 0;

  public flyAlongPath(path: Vector3[], onFrame: (pos: Vector3, target: Vector3) => void): void {
    this.isFlying = true;
    this.currentPointIndex = 0;
    const interval = setInterval(() => {
      if (!this.isFlying || this.currentPointIndex >= path.length - 1) {
        this.isFlying = false;
        clearInterval(interval);
        return;
      }
      const pos = path[this.currentPointIndex];
      const target = path[this.currentPointIndex + 1];
      onFrame(pos, target);
      this.currentPointIndex++;
    }, 50);
  }
}

export class VirtualColonoscopy {
  public flyEngine = new FlyThroughEngine();

  public startColonFlyThrough(centerline: Vector3[], onFrame: (pos: Vector3, target: Vector3) => void): void {
    this.flyEngine.flyAlongPath(centerline, onFrame);
  }
}
