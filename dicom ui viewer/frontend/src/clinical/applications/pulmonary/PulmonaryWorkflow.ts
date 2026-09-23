import { Vector3 } from '../../../3d/math/Vector3';

export interface BronchoscopyCameraFrame {
  position: Vector3;
  target: Vector3;
  branchName: string;
}

export class VirtualBronchoscopy {
  public cameraPath: BronchoscopyCameraFrame[] = [];

  public generatePath(airwayCenterline: Vector3[]): BronchoscopyCameraFrame[] {
    this.cameraPath = [];
    for (let i = 0; i < airwayCenterline.length; i++) {
      const pos = airwayCenterline[i];
      const target = airwayCenterline[Math.min(airwayCenterline.length - 1, i + 1)];
      this.cameraPath.push({
        position: pos.clone(),
        target: target.clone(),
        branchName: i < 5 ? 'Main Trachea' : 'Right Main Bronchus'
      });
    }
    return this.cameraPath;
  }
}

export class PulmonaryWorkflow {
  public broncho = new VirtualBronchoscopy();

  public startBronchoscopy(centerline: Vector3[]): BronchoscopyCameraFrame[] {
    return this.broncho.generatePath(centerline);
  }
}
