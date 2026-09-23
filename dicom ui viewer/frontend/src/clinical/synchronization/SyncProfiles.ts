export type SpecialtyProfile = 'radiology' | 'cardiology' | 'pet-ct' | 'manual';

export interface SyncConfig {
  syncCrosshairs: boolean;
  syncWindowLevel: boolean;
  syncZoomPan: boolean;
  syncOrientation: boolean;
  syncSlicePosition: boolean;
  syncCine: boolean;
}

export class SyncProfiles {
  public static PROFILES: Record<SpecialtyProfile, SyncConfig> = {
    radiology: {
      syncCrosshairs: true,
      syncWindowLevel: false,
      syncZoomPan: true,
      syncOrientation: true,
      syncSlicePosition: true,
      syncCine: true
    },
    cardiology: {
      syncCrosshairs: true,
      syncWindowLevel: false,
      syncZoomPan: true,
      syncOrientation: false,
      syncSlicePosition: true,
      syncCine: true
    },
    'pet-ct': {
      syncCrosshairs: true,
      syncWindowLevel: false,
      syncZoomPan: true,
      syncOrientation: true,
      syncSlicePosition: true,
      syncCine: false
    },
    manual: {
      syncCrosshairs: false,
      syncWindowLevel: false,
      syncZoomPan: false,
      syncOrientation: false,
      syncSlicePosition: false,
      syncCine: false
    }
  };
}
