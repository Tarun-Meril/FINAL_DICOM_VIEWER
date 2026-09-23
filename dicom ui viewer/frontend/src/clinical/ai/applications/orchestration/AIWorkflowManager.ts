import { Vector3 } from '../../../../3d/math/Vector3';
import { OrganSegmentationAI, AISegmentationResult } from '../segmentation/OrganSegmentationAI';
import { LungNoduleDetection, AIDetectionCandidate } from '../detection/LungNoduleDetection';
import { DiseaseClassifier, AIClassificationResult } from '../classification/DiseaseClassifier';
import { WorklistPrioritizer, WorklistTriageItem } from '../prioritization/WorklistPrioritizer';
import { AISummaryGenerator, AIDraftReport } from '../reporting/AISummaryGenerator';

export class VisionLanguageBridge {
  public static generateVisionLanguageCaption(candidate: AIDetectionCandidate): string {
    return `3D Vision-Language AI caption: High-confidence ${candidate.type} detected at location [${candidate.centroid.x}, ${candidate.centroid.y}, ${candidate.centroid.z}] with diameter ${candidate.diameterMm}mm.`;
  }
}

export class AIWorkflowManager {
  public runFullAIDiagnosticPipeline(studyUid: string, patientName: string, dims: Vector3) {
    const seg = OrganSegmentationAI.segmentOrgan('Lungs', dims);
    const detections = LungNoduleDetection.detectNodules(dims);
    const classification = DiseaseClassifier.classify('CT', 'Lungs');
    const triage = WorklistPrioritizer.prioritizeStudy(studyUid, patientName, detections);
    const draftReport = AISummaryGenerator.generateDraftReport(studyUid, detections);

    return {
      segmentation: seg,
      detections,
      classification,
      triage,
      draftReport
    };
  }
}
