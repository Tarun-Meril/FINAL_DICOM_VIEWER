export interface ClinicalAnnotation {
  id: string;
  type: 'text' | 'arrow' | 'polygon' | 'ellipse';
  studyInstanceUid: string;
  seriesInstanceUid: string;
  sliceIndex: number;
  coordinates: number[][];
  label: string;
  author: string;
  createdAt: string;
}

export class AnnotationStorage {
  private annotations = new Map<string, ClinicalAnnotation>();

  public save(annotation: ClinicalAnnotation): void {
    this.annotations.set(annotation.id, annotation);
  }

  public getBySeries(seriesUid: string): ClinicalAnnotation[] {
    return Array.from(this.annotations.values()).filter(a => a.seriesInstanceUid === seriesUid);
  }

  public remove(id: string): boolean {
    return this.annotations.delete(id);
  }

  public serializeJson(): string {
    return JSON.stringify(Array.from(this.annotations.values()), null, 2);
  }
}

export class AnnotationManager {
  public storage = new AnnotationStorage();

  public createTextAnnotation(studyUid: string, seriesUid: string, sliceIndex: number, coords: number[][], text: string): ClinicalAnnotation {
    const ann: ClinicalAnnotation = {
      id: `ann-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      type: 'text',
      studyInstanceUid: studyUid,
      seriesInstanceUid: seriesUid,
      sliceIndex,
      coordinates: coords,
      label: text,
      author: 'Radiologist',
      createdAt: new Date().toISOString()
    };
    this.storage.save(ann);
    return ann;
  }
}
