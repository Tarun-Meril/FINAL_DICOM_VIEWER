export interface Study {
  studyInstanceUid: string;
  patientName: string;
  patientId: string;
  patientBirthDate: string;
  patientSex: string;
  studyDate: string;
  studyTime: string;
  accessionNumber: string;
  studyDescription: string;
  modalitiesInStudy: string;
  numberOfStudyRelatedSeries: number;
  numberOfStudyRelatedInstances: number;
  institution: string;
  status: string;
}

export interface Series {
  seriesInstanceUid: string;
  studyInstanceUid: string;
  seriesNumber: number;
  modality: string;
  seriesDescription: string;
  numberOfSeriesRelatedInstances: number;
}

export interface Instance {
  sopInstanceUid: string;
  seriesInstanceUid: string;
  studyInstanceUid: string;
  instanceNumber: number;
  filePath: string;
  fileSize: number;
}
