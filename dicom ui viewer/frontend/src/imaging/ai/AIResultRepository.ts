/**
 * AIResultRepository Tracker
 * In-memory repository for storing AI clinical results (Masks, Bounding Boxes, Heatmaps, Reports)
 */

import { IAIResultRepository } from '../types/contracts';

export class AIResultRepository implements IAIResultRepository {
  private repoMap: Map<string, any> = new Map();

  public saveResult(targetId: string, result: any): void {
    if (!targetId) return;
    this.repoMap.set(targetId, result);
  }

  public getResult(targetId: string): any | undefined {
    return this.repoMap.get(targetId);
  }

  public clear(): void {
    this.repoMap.clear();
  }
}
