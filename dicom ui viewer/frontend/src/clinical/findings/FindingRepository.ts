import { ClinicalFindingData } from '../model/ClinicalCase';

export class FindingRepository {
  private findings = new Map<string, ClinicalFindingData>();

  public addFinding(finding: ClinicalFindingData): void {
    this.findings.set(finding.id, finding);
  }

  public getFinding(id: string): ClinicalFindingData | undefined {
    return this.findings.get(id);
  }

  public getByCategory(category: string): ClinicalFindingData[] {
    return Array.from(this.findings.values()).filter(f => f.category === category);
  }

  public getAll(): ClinicalFindingData[] {
    return Array.from(this.findings.values());
  }
}

export class FindingClassifier {
  public static classifySeverity(finding: ClinicalFindingData): 'normal' | 'mild' | 'moderate' | 'severe' {
    return finding.severity;
  }
}
