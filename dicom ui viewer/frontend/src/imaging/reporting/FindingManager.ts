/**
 * FindingManager Subsystem
 * Tracks radiology observations and anatomical findings
 */

export class FindingManager {
  private findings: string[] = [];

  public addFinding(finding: string): void {
    this.findings.push(finding);
  }

  public getFindings(): string[] {
    return [...this.findings];
  }
}
