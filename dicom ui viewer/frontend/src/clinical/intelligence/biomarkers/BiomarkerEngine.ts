export interface QuantitativeBiomarker {
  id: string;
  name: string;
  category: 'Organ' | 'Vascular' | 'Lesion' | 'Bone' | 'Cardiac' | 'Perfusion';
  value: number;
  unit: string;
  normalRange?: [number, number];
  isAbnormal: boolean;
}

export class BiomarkerCalculator {
  public static calculateOrganVolumeBiomarker(organName: string, volumeCm3: number, normalMin: number, normalMax: number): QuantitativeBiomarker {
    const abnormal = volumeCm3 < normalMin || volumeCm3 > normalMax;
    return {
      id: `bm-${organName.toLowerCase().replace(/\s+/g, '-')}`,
      name: `${organName} Volumetric Measure`,
      category: 'Organ',
      value: volumeCm3,
      unit: 'cm³',
      normalRange: [normalMin, normalMax],
      isAbnormal: abnormal
    };
  }

  public static calculateVesselStenosisBiomarker(vesselName: string, stenosisPct: number): QuantitativeBiomarker {
    return {
      id: `bm-stenosis-${vesselName.toLowerCase()}`,
      name: `${vesselName} Luminal Area Stenosis`,
      category: 'Vascular',
      value: stenosisPct,
      unit: '%',
      normalRange: [0, 50],
      isAbnormal: stenosisPct >= 50
    };
  }
}

export class BiomarkerEngine {
  private biomarkers = new Map<string, QuantitativeBiomarker>();

  public registerBiomarker(bm: QuantitativeBiomarker): void {
    this.biomarkers.set(bm.id, bm);
  }

  public getBiomarkers(): QuantitativeBiomarker[] {
    return Array.from(this.biomarkers.values());
  }
}
