export interface ClinicalPatient {
  id: string;
  name: string;
  birthDate?: string;
  sex?: string;
}

export interface ClinicalMeasurementData {
  id: string;
  type: 'distance' | 'angle' | 'area' | 'volume' | 'hu_stats';
  value: number;
  unit: string;
  formattedText: string;
  points: number[][];
}

export interface ClinicalLesionData {
  lesionId: string;
  name: string;
  anatomicalLocation: string;
  baselineVolumeCm3: number;
  currentVolumeCm3: number;
  growthPercentage: number;
  status: 'stable' | 'progressive' | 'responding' | 'new';
}

export interface ClinicalObservationData {
  id: string;
  category: string;
  statement: string;
  confidenceScore: number; // 0..1
}

export interface ClinicalFindingData {
  id: string;
  title: string;
  category: 'Vascular' | 'Cardiac' | 'Neuro' | 'Pulmonary' | 'Abdomen' | 'Musculoskeletal' | 'General';
  severity: 'normal' | 'mild' | 'moderate' | 'severe';
  status: 'active' | 'resolved' | 'follow-up';
  description: string;
  measurements: ClinicalMeasurementData[];
  observations: ClinicalObservationData[];
  linkedLesion?: ClinicalLesionData;
  createdAt: string;
}

export interface ClinicalProcedureData {
  id: string;
  code: string;
  description: string;
  performedDate: string;
}

export interface ClinicalRecommendationData {
  id: string;
  recommendationType: 'follow-up-ct' | 'follow-up-mri' | 'biopsy' | 'consultation' | 'routine';
  timeframe: string;
  rationale: string;
}

export interface ClinicalSeriesData {
  seriesUid: string;
  seriesNumber: number;
  modality: string;
  description: string;
  instanceCount: number;
}

export interface ClinicalStudyData {
  studyUid: string;
  studyDate: string;
  description: string;
  modalities: string[];
  seriesList: ClinicalSeriesData[];
}

export class ClinicalCase {
  public caseId: string;
  public patient: ClinicalPatient;
  public activeStudy: ClinicalStudyData | null = null;
  public priorStudies: ClinicalStudyData[] = [];
  public findings: ClinicalFindingData[] = [];
  public procedures: ClinicalProcedureData[] = [];
  public recommendations: ClinicalRecommendationData[] = [];
  public createdAt: string;

  constructor(caseId: string, patient: ClinicalPatient) {
    this.caseId = caseId;
    this.patient = patient;
    this.createdAt = new Date().toISOString();
  }

  public addFinding(finding: ClinicalFindingData): void {
    this.findings.push(finding);
  }

  public addProcedure(procedure: ClinicalProcedureData): void {
    this.procedures.push(procedure);
  }

  public addRecommendation(rec: ClinicalRecommendationData): void {
    this.recommendations.push(rec);
  }
}
