/**
 * ImpressionManager Subsystem
 * Clinical diagnostic impressions management
 */

export class ImpressionManager {
  private impressions: string[] = [];

  public addImpression(impression: string): void {
    this.impressions.push(impression);
  }

  public getImpressions(): string[] {
    return [...this.impressions];
  }
}
