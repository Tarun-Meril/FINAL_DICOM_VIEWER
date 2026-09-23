/**
 * ConfidenceManager Subsystem
 * Filters AI detection findings based on clinical confidence thresholds
 */

export class ConfidenceManager {
  private threshold: number = 0.8;

  public setThreshold(threshold: number): void {
    this.threshold = Math.max(0, Math.min(1, threshold));
  }

  public filterFindings(findings: any[]): any[] {
    return findings.filter((f) => f.confidence >= this.threshold);
  }
}
