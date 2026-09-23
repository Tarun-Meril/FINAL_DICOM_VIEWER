export interface PatientInfo {
  id: string;
  name: string;
  birthDate?: string;
  sex?: string;
}

export interface SeriesInfo {
  seriesInstanceUid: string;
  studyInstanceUid: string;
  seriesNumber: number;
  modality: string;
  description: string;
  numberOfInstances: number;
}

export interface StudyInfo {
  studyInstanceUid: string;
  patient: PatientInfo;
  studyDate: string;
  studyTime?: string;
  studyDescription: string;
  institution?: string;
  modalities: string[];
  seriesList: SeriesInfo[];
}

export class StudyContext {
  public activeStudy: StudyInfo | null = null;
  public activeSeriesUid: string | null = null;
  public activeViewportId = 'viewport-1';
  public currentLayout = '2x2';

  public loadStudy(study: StudyInfo): void {
    this.activeStudy = study;
    if (study.seriesList.length > 0) {
      this.activeSeriesUid = study.seriesList[0].seriesInstanceUid;
    }
  }

  public selectSeries(seriesUid: string): void {
    if (this.activeStudy) {
      const exists = this.activeStudy.seriesList.some((s) => s.seriesInstanceUid === seriesUid);
      if (exists) this.activeSeriesUid = seriesUid;
    }
  }

  public clear(): void {
    this.activeStudy = null;
    this.activeSeriesUid = null;
  }
}

export class ClinicalSession {
  public sessionId: string;
  public username = 'radiologist';
  public userRole = 'Attending Radiologist';
  public activeToken: string | null = null;

  constructor(sessionId = 'session-default') {
    this.sessionId = sessionId;
  }
}
