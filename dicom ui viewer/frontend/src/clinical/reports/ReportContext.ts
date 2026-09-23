import { MeasurementRecord } from '../measurements/MeasurementCoordinator';

export interface FindingEntry {
  id: string;
  category: 'Lungs' | 'Heart' | 'Vessels' | 'Bones' | 'Abdomen' | 'Brain' | 'General';
  description: string;
  severity: 'normal' | 'mild' | 'moderate' | 'severe';
  linkedMeasurements: MeasurementRecord[];
  keyImageUrls: string[];
}

export class FindingManager {
  private findings: FindingEntry[] = [];

  public addFinding(finding: FindingEntry): void {
    this.findings.push(finding);
  }

  public getFindings(): FindingEntry[] {
    return this.findings;
  }
}

export class ReportContext {
  public studyInstanceUid = '';
  public patientName = '';
  public radiologistName = 'Dr. Sarah Smith';
  public findingsManager = new FindingManager();
  public impression = '';
  public reportStatus: 'Draft' | 'Preliminary' | 'Final' = 'Draft';

  public generateReportJson(): string {
    return JSON.stringify({
      studyInstanceUid: this.studyInstanceUid,
      patientName: this.patientName,
      radiologistName: this.radiologistName,
      status: this.reportStatus,
      impression: this.impression,
      findings: this.findingsManager.getFindings()
    }, null, 2);
  }
}
