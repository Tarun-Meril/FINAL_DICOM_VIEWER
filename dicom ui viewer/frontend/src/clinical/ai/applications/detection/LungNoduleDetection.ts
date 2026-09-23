import { Vector3 } from '../../../../3d/math/Vector3';

export interface AIDetectionCandidate {
  id: string;
  type: 'lung_nodule' | 'brain_hemorrhage' | 'fracture' | 'liver_lesion' | 'colon_polyp' | 'breast_mass';
  confidence: number; // 0..1
  boundingMin: Vector3;
  boundingMax: Vector3;
  centroid: Vector3;
  diameterMm: number;
  isCritical: boolean;
}

export class LungNoduleDetection {
  public static detectNodules(dims: Vector3): AIDetectionCandidate[] {
    return [
      {
        id: 'nodule-ai-1',
        type: 'lung_nodule',
        confidence: 0.93,
        boundingMin: new Vector3(10, 10, 10),
        boundingMax: new Vector3(18, 18, 18),
        centroid: new Vector3(14, 14, 14),
        diameterMm: 8.5,
        isCritical: false
      }
    ];
  }
}

export class BrainHemorrhageDetection {
  public static detectHemorrhage(dims: Vector3): AIDetectionCandidate[] {
    return [
      {
        id: 'hemorrhage-ai-1',
        type: 'brain_hemorrhage',
        confidence: 0.98,
        boundingMin: new Vector3(20, 20, 20),
        boundingMax: new Vector3(35, 35, 35),
        centroid: new Vector3(27.5, 27.5, 27.5),
        diameterMm: 22.0,
        isCritical: true
      }
    ];
  }
}
