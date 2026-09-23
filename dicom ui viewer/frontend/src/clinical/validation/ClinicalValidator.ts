import { ClinicalCase } from '../model/ClinicalCase';

export interface ValidationIssue {
  code: string;
  message: string;
  severity: 'warning' | 'error';
}

export class ClinicalValidator {
  public static validateCase(clinicalCase: ClinicalCase): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!clinicalCase.patient.id || clinicalCase.patient.id.trim() === '') {
      issues.push({
        code: 'MISSING_PATIENT_ID',
        message: 'Clinical case is missing a valid Patient ID.',
        severity: 'error'
      });
    }

    if (!clinicalCase.activeStudy) {
      issues.push({
        code: 'MISSING_ACTIVE_STUDY',
        message: 'No active study attached to clinical case.',
        severity: 'warning'
      });
    }

    clinicalCase.findings.forEach(f => {
      if (!f.description || f.description.trim() === '') {
        issues.push({
          code: 'EMPTY_FINDING_DESCRIPTION',
          message: `Finding ${f.id} has an empty description text.`,
          severity: 'warning'
        });
      }
    });

    return issues;
  }
}
