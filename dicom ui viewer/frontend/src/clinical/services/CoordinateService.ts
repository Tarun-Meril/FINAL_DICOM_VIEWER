export class CoordinateService {
  public voxelToPatient(voxelIndex: [number, number, number], spacing: [number, number, number]): [number, number, number] {
    return [
      voxelIndex[0] * spacing[0],
      voxelIndex[1] * spacing[1],
      voxelIndex[2] * spacing[2]
    ];
  }
}

export class NavigationService {
  public isCinePlaying = false;
  public frameRate = 24;

  public toggleCine(): boolean {
    this.isCinePlaying = !this.isCinePlaying;
    return this.isCinePlaying;
  }
}

type ClinicalEventCallback = (payload?: any) => void;

export class ClinicalEvents {
  private listeners = new Map<string, Set<ClinicalEventCallback>>();

  public static STUDY_LOADED = 'clinical:study_loaded';
  public static SERIES_CHANGED = 'clinical:series_changed';
  public static MEASUREMENT_ADDED = 'clinical:measurement_added';
  public static ANNOTATION_MODIFIED = 'clinical:annotation_modified';
  public static BOOKMARK_SELECTED = 'clinical:bookmark_selected';
  public static REPORT_UPDATED = 'clinical:report_updated';

  public on(event: string, callback: ClinicalEventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.off(event, callback);
  }

  public off(event: string, callback: ClinicalEventCallback): void {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.delete(callback);
    }
  }

  public emit(event: string, payload?: any): void {
    if (this.listeners.has(event)) {
      for (const cb of this.listeners.get(event)!) cb(payload);
    }
  }
}
