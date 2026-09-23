import { ClinicalEngine } from './engine/ClinicalEngine';
import { StudyInfo } from './engine/StudyContext';
import { BookmarkManager } from './bookmarks/BookmarkManager';
import { ReportContext } from './reports/ReportContext';
import { ClinicalEvents } from './services/CoordinateService';
import { CPREngine } from './cpr/engine/CPREngine';
import { MPRManager } from './mpr/MPRManager';
import { CineController } from './cine/CineController';
import { FusionEngine, FusionLayer } from './fusion/FusionEngine';
import { RigidRegistration } from './registration/RegistrationTransform';
import { SegmentationEngine } from './segmentation/SegmentationEngine';
import { MeshExporter } from './segmentation/mesh/MeshExporter';
import { Vector3 } from '../3d/math/Vector3';

import { ClinicalCase, ClinicalPatient, ClinicalFindingData, ClinicalMeasurementData } from './model/ClinicalCase';
import { LongitudinalAnalysis } from './comparison/StudyComparison';
import { ClinicalTimeline } from './timeline/ClinicalTimeline';
import { ClinicalValidator } from './validation/ClinicalValidator';
import { FindingRepository } from './findings/FindingRepository';

import { VesselAnalysisEngine } from './applications/vascular/VesselAnalysisEngine';
import { CardiacWorkflow } from './applications/cardiac/CardiacWorkflow';
import { NeuroWorkflow } from './applications/neuro/NeuroWorkflow';
import { PulmonaryWorkflow } from './applications/pulmonary/PulmonaryWorkflow';
import { VirtualColonoscopy } from './applications/gastrointestinal/VirtualColonoscopy';
import { BoneWorkflow } from './applications/orthopedic/BoneWorkflow';
import { SurgicalPlanning } from './applications/surgical/SurgicalPlanning';
import { FollowUpWorkflow } from './applications/longitudinal/FollowUpWorkflow';

import { IntelligenceOrchestrator } from './intelligence/orchestration/IntelligenceOrchestrator';
import { BiomarkerCalculator } from './intelligence/biomarkers/BiomarkerEngine';

import { AIOrchestrator } from './ai/core/AIOrchestrator';
import { AccuracyMetricsCalculator } from './ai/metrics/DiceScore';

import { OrganSegmentationAI } from './ai/applications/segmentation/OrganSegmentationAI';
import { LungNoduleDetection } from './ai/applications/detection/LungNoduleDetection';
import { DiseaseClassifier } from './ai/applications/classification/DiseaseClassifier';
import { WorklistPrioritizer } from './ai/applications/prioritization/WorklistPrioritizer';
import { AISummaryGenerator } from './ai/applications/reporting/AISummaryGenerator';
import { AIWorkflowManager } from './ai/applications/orchestration/AIWorkflowManager';

// Phase 25 Rendering Engine Imports - REMOVED

export * from './engine/StudyContext';
export * from './engine/ClinicalEngine';
export * from './workflow/WorkflowManager';
export * from './viewport/ViewportCoordinator';
export * from './annotations/AnnotationManager';
export * from './bookmarks/BookmarkManager';
export * from './measurements/MeasurementCoordinator';
export * from './reports/ReportContext';
export * from './hanging/HangingProtocolEngine';
export * from './services/CoordinateService';

export * from './cpr/engine/CPREngine';
export * from './cpr/geometry/FrenetFrame';
export * from './cpr/centerline/CenterlineEditor';
export * from './mpr/MPRManager';
export * from './filters/ImageFilter';
export * from './fusion/FusionEngine';
export * from './registration/RegistrationTransform';
export * from './cine/CineController';
export * from './synchronization/SyncProfiles';
export * from './workers/ReconstructionWorker';
export * from './benchmarks/CPRBenchmark';
export * from './tools/ToolManager';
export * from './toolstate/ToolSettings';

export * from './segmentation/SegmentationEngine';
export * from './segmentation/labels/LabelMap';
export * from './segmentation/surface/SurfaceGenerator';
export * from './segmentation/mesh/MeshExporter';
export * from './segmentation/quantification/QuantificationEngine';

export * from './model/ClinicalCase';
export * from './workflow/WorkflowEngine';
export * from './comparison/StudyComparison';
export * from './interop/InteroperabilityEngine';
export * from './findings/FindingRepository';
export * from './timeline/ClinicalTimeline';
export * from './validation/ClinicalValidator';

export * from './applications/vascular/VesselAnalysisEngine';
export * from './applications/cardiac/CardiacWorkflow';
export * from './applications/neuro/NeuroWorkflow';
export * from './applications/pulmonary/PulmonaryWorkflow';
export * from './applications/gastrointestinal/VirtualColonoscopy';
export * from './applications/orthopedic/BoneWorkflow';
export * from './applications/surgical/SurgicalPlanning';
export * from './applications/longitudinal/FollowUpWorkflow';

export * from './intelligence/biomarkers/BiomarkerEngine';
export * from './intelligence/decisionSupport/DecisionSupportEngine';
export * from './intelligence/scoring/ClinicalScoringEngine';
export * from './intelligence/quality/StudyQualityEngine';
export * from './intelligence/explainability/ExplainabilityEngine';
export * from './intelligence/findings/ClinicalSummary';
export * from './intelligence/orchestration/IntelligenceOrchestrator';

export * from './ai/models/ModelRegistry';
export * from './ai/preprocessing/IntensityNormalization';
export * from './ai/postprocessing/ProbabilityMaps';
export * from './ai/metrics/DiceScore';
export * from './ai/gpu/GPUResourceManager';
export * from './ai/core/AIOrchestrator';

export * from './ai/applications/segmentation/OrganSegmentationAI';
export * from './ai/applications/detection/LungNoduleDetection';
export * from './ai/applications/classification/DiseaseClassifier';
export * from './ai/applications/measurements/AutoRECIST';
export * from './ai/applications/prioritization/WorklistPrioritizer';
export * from './ai/applications/reporting/AISummaryGenerator';
export * from './ai/applications/orchestration/AIWorkflowManager';

// Export Phase 25 Rendering Subsystems - REMOVED

export class EnterpriseClinicalFacade {
  public engine = new ClinicalEngine();
  public bookmarkManager = new BookmarkManager();
  public reportContext = new ReportContext();
  public events = new ClinicalEvents();
  public cprEngine = new CPREngine();
  public mprManager = new MPRManager();
  public cineController = new CineController();
  public fusionEngine = new FusionEngine();
  public segmentationEngine = new SegmentationEngine();
  public findingRepository = new FindingRepository();
  public intelligence = new IntelligenceOrchestrator();
  public aiOrchestrator = new AIOrchestrator();
  public aiWorkflowManager = new AIWorkflowManager();
  public activeCase: ClinicalCase | null = null;

  public vascularEngine = new VesselAnalysisEngine();
  public cardiacWorkflow = new CardiacWorkflow();
  public neuroWorkflow = new NeuroWorkflow();
  public pulmonaryWorkflow = new PulmonaryWorkflow();
  public virtualColonoscopy = new VirtualColonoscopy();
  public boneWorkflow = new BoneWorkflow();
  public surgicalPlanning = new SurgicalPlanning();
  public followUpWorkflow = new FollowUpWorkflow();

  // Phase 25 Enterprise Cinematic Rendering & Interaction Subsystems - REMOVED

  public runAISegmentation(organName: string, dims: Vector3) {
    return OrganSegmentationAI.segmentOrgan(organName, dims);
  }

  public runAIDetection(dims: Vector3) {
    return LungNoduleDetection.detectNodules(dims);
  }

  public runAIClassification(modality: string, bodyPart: string) {
    return DiseaseClassifier.classify(modality, bodyPart);
  }

  public generateAISummary(studyUid: string) {
    const detections = LungNoduleDetection.detectNodules(new Vector3(64, 64, 64));
    return AISummaryGenerator.generateDraftReport(studyUid, detections);
  }

  public prioritizeWorklist(studyUid: string, patientName: string, dims: Vector3) {
    const candidates = LungNoduleDetection.detectNodules(dims);
    return WorklistPrioritizer.prioritizeStudy(studyUid, patientName, candidates);
  }

  public generateDraftReport(studyUid: string) {
    return this.generateAISummary(studyUid);
  }

  public loadModel(modelId: string) {
    return this.aiOrchestrator.modelRegistry.getModel(modelId);
  }

  public async runInference(modelId: string, scalarData: Int16Array, dims: Vector3) {
    return await this.aiOrchestrator.runInference(modelId, scalarData, dims);
  }

  public validatePrediction(truthMask: Uint8Array, predMask: Uint8Array) {
    return AccuracyMetricsCalculator.computeAll(truthMask, predMask);
  }

  public registerDataset(datasetName: string) {
    return `Registered AI dataset: ${datasetName}`;
  }

  public getInferenceMetrics(truthMask: Uint8Array, predMask: Uint8Array) {
    return AccuracyMetricsCalculator.computeAll(truthMask, predMask);
  }

  public computeBiomarkers() {
    return this.intelligence.computeBiomarkers();
  }

  public generateRecommendations() {
    return this.intelligence.generateRecommendations();
  }

  public computeClinicalScore(noduleSizeMm: number) {
    return this.intelligence.computeClinicalScore(noduleSizeMm);
  }

  public assessStudyQuality(numInstances: number, sliceSpacingMm: number) {
    return this.intelligence.assessStudyQuality(numInstances, sliceSpacingMm);
  }

  public generateClinicalSummary(patientId = 'P001') {
    return this.intelligence.generateClinicalSummary(patientId);
  }

  public startVascularWorkflow(vesselName: string, refDiam: number, minDiam: number, points: Vector3[]) {
    const res = this.vascularEngine.analyzeVessel(vesselName, refDiam, minDiam, points);
    const bm = BiomarkerCalculator.calculateVesselStenosisBiomarker(vesselName, res.diameterStenosisPercentage);
    this.intelligence.biomarkerEngine.registerBiomarker(bm);
    return res;
  }

  public startCardiacWorkflow(lesions: { peakHu: number; areaMm2: number }[]) {
    const res = this.cardiacWorkflow.scoreCoronaryCalcium(lesions);
    this.intelligence.biomarkerEngine.registerBiomarker({
      id: 'bm-cac-score',
      name: 'Agatston CAC Calcium Score',
      category: 'Cardiac',
      value: res.agatstonScore,
      unit: 'Agatston',
      normalRange: [0, 10],
      isAbnormal: res.agatstonScore > 10
    });
    return res;
  }

  public startNeuroWorkflow(id: string, dome: number, neck: number) {
    return this.neuroWorkflow.analyzeBrainAneurysm(id, dome, neck);
  }

  public startPulmonaryWorkflow(centerline: Vector3[]) {
    return this.pulmonaryWorkflow.startBronchoscopy(centerline);
  }

  public startVirtualBronchoscopy(centerline: Vector3[]) {
    return this.pulmonaryWorkflow.startBronchoscopy(centerline);
  }

  public startVirtualColonoscopy(centerline: Vector3[], onFrame: (pos: Vector3, target: Vector3) => void) {
    this.virtualColonoscopy.startColonFlyThrough(centerline, onFrame);
  }

  public startOrthopedicWorkflow(p1: Vector3, p2: Vector3) {
    return this.boneWorkflow.measureFracture(p1, p2);
  }

  public startSurgicalPlanning(lesionPos: Vector3, vesselPos: Vector3, minMm = 10) {
    return this.surgicalPlanning.evaluateSafetyMargin(lesionPos, vesselPos, minMm);
  }

  public compareFollowUpStudies(lesionId: string, name: string, baselineVol: number, currentVol: number) {
    return this.followUpWorkflow.compareLesions(lesionId, name, baselineVol, currentVol);
  }

  public createCase(patient: ClinicalPatient): ClinicalCase {
    this.activeCase = new ClinicalCase(`case-${Date.now()}`, patient);
    return this.activeCase;
  }

  public addFinding(finding: ClinicalFindingData): void {
    if (this.activeCase) {
      this.activeCase.addFinding(finding);
      this.findingRepository.addFinding(finding);
      this.events.emit(ClinicalEvents.REPORT_UPDATED, finding);
    }
  }

  public addMeasurement(findingId: string, measurement: ClinicalMeasurementData): void {
    const finding = this.findingRepository.getFinding(findingId);
    if (finding) {
      finding.measurements.push(measurement);
      this.events.emit(ClinicalEvents.MEASUREMENT_ADDED, measurement);
    }
  }

  public compareStudies(lesionId: string, name: string, baselineVolCm3: number, followUpVolCm3: number) {
    return LongitudinalAnalysis.compareLesions(lesionId, name, baselineVolCm3, followUpVolCm3);
  }

  public trackLesion(lesionId: string, name: string, baselineVol: number, currentVol: number) {
    return LongitudinalAnalysis.compareLesions(lesionId, name, baselineVolCm3, followUpVolCm3);
  }

  public generateTimeline(): any[] {
    if (!this.activeCase) return [];
    return ClinicalTimeline.generateTimeline(this.activeCase);
  }

  public validateClinicalCase() {
    if (!this.activeCase) return [{ code: 'NO_ACTIVE_CASE', message: 'No active clinical case loaded.', severity: 'error' }];
    return ClinicalValidator.validateCase(this.activeCase);
  }

  public openStudy(study: StudyInfo): void {
    this.engine.openStudy(study);
    this.events.emit(ClinicalEvents.STUDY_LOADED, study);
  }

  public closeStudy(): void {
    this.engine.closeStudy();
  }

  public createObliqueMPR(pitchDeg: number, rollDeg: number) {
    this.mprManager.oblique.setRotation(pitchDeg, rollDeg);
    return this.mprManager.oblique;
  }

  public createCPR() {
    return this.cprEngine;
  }

  public startCine(onFrame: (frame: number) => void) {
    this.cineController.start(onFrame);
  }

  public stopCine() {
    this.cineController.stop();
  }

  public createFusion(layer: FusionLayer) {
    this.fusionEngine.addLayer(layer);
    return this.fusionEngine;
  }

  public registerVolumes() {
    return new RigidRegistration();
  }

  public setSlabThickness(thicknessMm: number) {
    this.mprManager.slab.slabThicknessMm = thicknessMm;
  }

  public createSegmentation(dims: Vector3) {
    return this.segmentationEngine.createLabelMap(dims);
  }

  public editSegmentation(center: Vector3, radius: number, segmentId = 1) {
    this.segmentationEngine.paintBrush(center, radius, segmentId);
  }

  public generateSurface(segmentId = 1) {
    return this.segmentationEngine.generateSurfaceMesh(segmentId);
  }

  public computeStatistics(scalarData: Int16Array, dims: Vector3, spacingMm: Vector3, segmentId = 1) {
    return this.segmentationEngine.computeStatistics(scalarData, dims, spacingMm, segmentId);
  }

  public exportMesh(segmentId = 1, format: 'stl' | 'obj' = 'stl') {
    const mesh = this.generateSurface(segmentId);
    if (!mesh) return null;
    return format === 'stl' ? MeshExporter.exportToSTL(mesh) : MeshExporter.exportToOBJ(mesh);
  }
}

export const clinicalFacade = new EnterpriseClinicalFacade();
