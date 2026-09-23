/**
 * CenterlineRepository Tracker
 * In-memory repository for storing and querying extracted vessel centerlines
 */

import { IVesselCenterline } from '../types/contracts';

export class CenterlineRepository {
  private repoMap: Map<string, IVesselCenterline> = new Map();

  public saveCenterline(centerline: IVesselCenterline): void {
    if (!centerline || !centerline.vesselId) return;
    this.repoMap.set(centerline.vesselId, centerline);
  }

  public getCenterline(vesselId: string): IVesselCenterline | undefined {
    return this.repoMap.get(vesselId);
  }

  public clear(): void {
    this.repoMap.clear();
  }
}
