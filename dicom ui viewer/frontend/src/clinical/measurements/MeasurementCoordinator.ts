export interface MeasurementRecord {
  id: string;
  type: 'distance' | 'angle' | 'ellipse' | 'rect' | 'volume';
  studyInstanceUid: string;
  seriesInstanceUid: string;
  value: number;
  unit: string;
  formattedValue: string;
  points: number[][];
  createdAt: string;
}

export class MeasurementStorage {
  private records = new Map<string, MeasurementRecord>();

  public add(record: MeasurementRecord): void {
    this.records.set(record.id, record);
  }

  public getByStudy(studyUid: string): MeasurementRecord[] {
    return Array.from(this.records.values()).filter(r => r.studyInstanceUid === studyUid);
  }

  public remove(id: string): boolean {
    return this.records.delete(id);
  }
}

export class MeasurementCoordinator {
  public storage = new MeasurementStorage();

  public addDistanceMeasurement(studyUid: string, seriesUid: string, distanceMm: number, points: number[][]): MeasurementRecord {
    const record: MeasurementRecord = {
      id: `meas-${Date.now()}`,
      type: 'distance',
      studyInstanceUid: studyUid,
      seriesInstanceUid: seriesUid,
      value: distanceMm,
      unit: 'mm',
      formattedValue: `${distanceMm.toFixed(1)} mm`,
      points,
      createdAt: new Date().toISOString()
    };
    this.storage.add(record);
    return record;
  }
}
