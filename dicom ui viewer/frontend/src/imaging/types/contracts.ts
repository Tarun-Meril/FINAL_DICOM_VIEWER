/**
 * Core Headless Imaging Engine Subsystem Interface Contracts
 */

import { EngineEvents } from './events';

export type LogCategory =
  | 'Engine'
  | 'Viewport'
  | 'Volume'
  | 'Metadata'
  | 'Loader'
  | 'Tool'
  | 'Sync'
  | 'Performance'
  | 'MPR'
  | '3D'
  | 'Segmentation'
  | 'Clinical'
  | 'Registration'
  | 'Fusion'
  | 'CPR'
  | 'Vessel'
  | 'AI'
  | 'Reporting'
  | 'Workflow';

export interface ICommand<TResult = any> {
  readonly name: string;
  execute(context: IEngineContext): Promise<TResult> | TResult;
}

export interface ICommandBus {
  registerCommand(name: string, handler: (context: IEngineContext, payload?: any) => any): void;
  executeCommand<T = any>(name: string, payload?: any): Promise<T>;
  hasCommand(name: string): boolean;
}

export interface IEventBus {
  on<T = any>(event: EngineEvents | string, callback: (payload: T) => void): () => void;
  off<T = any>(event: EngineEvents | string, callback: (payload: T) => void): void;
  emit<T = any>(event: EngineEvents | string, payload?: T): void;
  removeAllListeners(event?: EngineEvents | string): void;
}

export interface IEngineLogger {
  debug(category: LogCategory, message: string, data?: any): void;
  info(category: LogCategory, message: string, data?: any): void;
  warn(category: LogCategory, message: string, data?: any): void;
  error(category: LogCategory, message: string, error?: Error, data?: any): void;
}

export interface IPerformanceMetrics {
  fps: number;
  gpuMemoryUsageMB: number;
  lastRenderTimeMs: number;
  volumeLoadTimeMs: number;
  metadataParseTimeMs: number;
  workerQueueDepth: number;

  // Phase 2 Initialization Metrics
  initTimeMs: number;
  workerStartupTimeMs: number;
  renderingEngineCreationTimeMs: number;
  metadataRegTimeMs: number;
  loaderRegTimeMs: number;

  // Phase 3 DICOM Pipeline Metrics
  studyLoadTimeMs: number;
  seriesLoadTimeMs: number;
  instanceLoadTimeMs: number;
  sliceSortTimeMs: number;
  imageIdGenTimeMs: number;

  // Phase 4 Viewport Metrics
  firstRenderTimeMs: number;
  viewportCreationTimeMs: number;
  displaySetBindTimeMs: number;
  averageRenderTimeMs: number;

  // Phase 5 Volume Metrics
  volumeBuildTimeMs: number;
  cacheHitRatio: number;
  cpuMemoryUsageMB: number;
  volumeSizeBytes: number;
  voxelCount: number;

  // Phase 6 MPR Metrics
  crosshairLatencyMs: number;
  sliceSyncLatencyMs: number;
  cameraSyncTimeMs: number;
  referenceLineUpdateTimeMs: number;
  averageMprFps: number;

  // Phase 7 3D Volume Rendering Metrics
  gpuRenderTimeMs: number;
  averageVrFps: number;
  transferFunctionUpdateTimeMs: number;

  // Phase 8 Segmentation & Clinical Metrics
  segmentationCreateTimeMs: number;
  brushLatencyMs: number;
  regionGrowingTimeMs: number;
  measurementCalculationTimeMs: number;
  annotationUpdateLatencyMs: number;
  segmentVoxelCount: number;

  // Phase 9 Advanced Clinical Visualization Metrics
  registrationTimeMs: number;
  fusionFps: number;
  transformLatencyMs: number;
  cprGenerationTimeMs: number;
  centerlineExtractionTimeMs: number;

  // Phase 10 AI Infrastructure Metrics
  aiInferenceLatencyMs: number;
  aiGpuUtilizationPercent: number;
  aiQueueDepth: number;
  aiModelLoadTimeMs: number;
}

export interface IPerformanceMonitor {
  recordRenderTime(durationMs: number): void;
  recordVolumeLoadTime(durationMs: number): void;
  recordMetadataParseTime(durationMs: number): void;
  recordInitMetric(key: keyof IPerformanceMetrics, durationMs: number): void;
  updateFps(fps: number): void;
  updateGpuMemory(mb: number): void;
  getMetrics(): Readonly<IPerformanceMetrics>;
}

export interface IEngineHeadlessState {
  initialized: boolean;
  cornerstoneInitialized: boolean;
  renderingEngineCreated: boolean;
  activeViewportId: string | null;
  activeTool: string;
  loadedStudies: string[];
  activeVolumes: string[];
}

export interface IEngineStateStore {
  getState(): Readonly<IEngineHeadlessState>;
  updateState(partial: Partial<IEngineHeadlessState>): void;
  subscribe(listener: (state: Readonly<IEngineHeadlessState>) => void): () => void;
}

export interface IRenderingEngineManager {
  readonly renderingEngineId: string;
  getRenderingEngine(): any;
  enableElement(viewportInput: any): void;
  disableElement(viewportId: string): void;
  resize(viewportId?: string): void;
  destroy(): void;
}

export interface ICornerstoneBootstrap {
  bootstrap(config?: IEngineConfig): Promise<void>;
  destroy(): Promise<void>;
  isBootstrapped(): boolean;
}

export interface IViewportCreationOptions {
  viewportId: string;
  container: HTMLDivElement;
  type?: 'STACK' | 'ORTHOGRAPHIC' | 'VOLUME_3D';
  orientation?: 'AXIAL' | 'SAGITTAL' | 'CORONAL';
  background?: [number, number, number];
}

export interface IViewportState {
  viewportId: string;
  type: 'STACK' | 'ORTHOGRAPHIC' | 'VOLUME_3D';
  containerId: string;
  displaySetInstanceUid?: string;
  currentSlice: number;
  totalSlices: number;
  windowWidth: number;
  windowLevel: number;
  zoom: number;
  pan: [number, number];
  rotation: number;
}

export interface IStackViewportController {
  readonly viewportId: string;
  bindDisplaySet(displaySet: any, initialSliceIndex?: number): Promise<void>;
  render(): void;
  resetCamera(): void;
  nextSlice(): void;
  previousSlice(): void;
  setSlice(sliceIndex: number): void;
  pan(deltaX: number, deltaY: number): void;
  zoom(zoomFactor: number): void;
  setWindowLevel(windowWidth: number, windowLevel: number): void;
  fitToWindow(): void;
  reset(): void;
  getCurrentSliceIndex(): number;
  getTotalSlices(): number;
  getState(): IViewportState;
}

export interface IViewportRegistry {
  register(viewportId: string, controller: any, containerId: string): void;
  unregister(viewportId: string): void;
  getController(viewportId: string): any;
  getAllControllers(): any[];
  getContainerId(viewportId: string): string | undefined;
  clear(): void;
}

export interface IViewportManager {
  createViewport(options: IViewportCreationOptions): Promise<any>;
  destroyViewport(viewportId: string): Promise<void>;
  resizeViewport(viewportId: string): void;
  resizeAll(): void;
  getController(viewportId: string): any;
  setActiveViewport(viewportId: string): void;
  getActiveViewportId(): string | null;
}

export interface IViewportSynchronizer {
  readonly id: string;
  addViewport(viewportId: string): void;
  removeViewport(viewportId: string): void;
  destroy(): void;
}

// Phase 5 Volume Engine Interfaces
export interface IVolumeDescriptor {
  volumeId: string;
  seriesInstanceUid: string;
  studyInstanceUid: string;
  imageIds: string[];
  dimensions: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
  direction: number[];
  numSlices: number;
  sizeMB: number;
  voxelCount: number;
  type: 'STREAMING' | 'LABELMAP' | 'SEGMENTATION' | 'FUSION';
}

export interface IVolumePreset {
  name: string;
  windowWidth: number;
  windowLevel: number;
  description?: string;
  colorMap?: string;
}

export interface IVolumeBuilder {
  buildVolumeDescriptor(displaySet: any): IVolumeDescriptor;
}

export interface IVolumeRepository {
  addVolume(descriptor: IVolumeDescriptor): void;
  getVolume(volumeId: string): IVolumeDescriptor | undefined;
  getAllVolumes(): IVolumeDescriptor[];
  removeVolume(volumeId: string): void;
  clear(): void;
}

export interface IVolumeCacheManager {
  setMaxMemoryLimitMB(limitMB: number): void;
  trackVolumeUsage(volumeId: string, sizeMB: number): void;
  evictLruVolume(): string | undefined;
  getCurrentMemoryUsageMB(): number;
  clearCache(): void;
}

export interface IPresetManager {
  getPreset(name: string): IVolumePreset | undefined;
  registerPreset(preset: IVolumePreset): void;
  getDefaultPresetForModality(modality: string): IVolumePreset;
}

export interface IVolumeFactory {
  createStreamingVolume(displaySet: any): IVolumeDescriptor;
}

export interface IVolumeLifecycleManager {
  createAndLoadVolume(displaySet: any): Promise<any>;
  unloadVolume(volumeId: string): Promise<void>;
}

export interface IOrthographicViewportController {
  readonly viewportId: string;
  readonly orientation: 'AXIAL' | 'SAGITTAL' | 'CORONAL';
  bindVolume(volumeId: string): Promise<void>;
  setOrientation(orientation: 'AXIAL' | 'SAGITTAL' | 'CORONAL'): void;
  resetCamera(): void;
  render(): void;
  destroy(): void;
}

// Phase 6 Enterprise MPR Interfaces
export interface IOrientationManager {
  getOrientationVectors(orientation: 'AXIAL' | 'SAGITTAL' | 'CORONAL'): {
    viewPlaneNormal: [number, number, number];
    viewUp: [number, number, number];
  };
}

export interface ICrosshairManager {
  setWorldPosition(pos: [number, number, number], sourceViewportId?: string): void;
  getWorldPosition(): [number, number, number];
  setCrosshairVisibility(visible: boolean): void;
}

export interface IReferenceLineManager {
  updateReferenceLines(sourceViewportId: string): void;
}

export interface ICameraSynchronizer {
  syncCamera(sourceViewportId: string): void;
}

export interface ISliceSynchronizer {
  syncSlice(sourceViewportId: string, sliceDelta: number): void;
}

export interface IVOISynchronizer {
  syncVOI(windowWidth: number, windowLevel: number, sourceViewportId?: string): void;
}

export interface IMPRViewportLayout {
  setLayout(type: '1x3' | '2x2' | '3+1' | 'SINGLE'): string[];
  getLayoutType(): '1x3' | '2x2' | '3+1' | 'SINGLE';
}

export interface IMPRWorkspaceManager {
  initializeMPRWorkspace(containers: {
    axial: HTMLDivElement;
    sagittal: HTMLDivElement;
    coronal: HTMLDivElement;
    stackOr3d?: HTMLDivElement;
  }, volumeId: string, layout?: '1x3' | '2x2' | '3+1' | 'SINGLE'): Promise<void>;

  switchLayout(layout: '1x3' | '2x2' | '3+1' | 'SINGLE'): void;
  destroyMPRWorkspace(): Promise<void>;
}

// Phase 7 Enterprise 3D Volume Rendering Interfaces - REMOVED

// Phase 8 Enterprise Segmentation & Clinical Tooling Interfaces
export interface ISegment {
  segmentIndex: number;
  label: string;
  color: [number, number, number, number];
  opacity: number;
  visible: boolean;
  locked: boolean;
  voxelCount: number;
}

export interface ISegmentation {
  segmentationId: string;
  label: string;
  volumeId: string;
  segments: ISegment[];
  activeSegmentIndex: number;
}

export interface ISegmentationManager {
  createSegmentation(label: string, volumeId: string): ISegmentation;
  deleteSegmentation(segmentationId: string): void;
  getSegmentation(segmentationId: string): ISegmentation | undefined;
  getAllSegmentations(): ISegmentation[];
  setSegmentVisibility(segmentationId: string, segmentIndex: number, visible: boolean): void;
  setSegmentColor(segmentationId: string, segmentIndex: number, color: [number, number, number, number]): void;
}

export interface ISegmentationRepository {
  saveSegmentation(segmentation: ISegmentation): void;
  getSegmentation(segmentationId: string): ISegmentation | undefined;
  clear(): void;
}

export interface ILabelMapManager {
  createLabelMapVolume(segmentationId: string, dimensions: [number, number, number]): Uint8Array;
}

export interface IRTStructManager {
  importRTStruct(datasetBuffer: ArrayBuffer): any;
  exportRTStruct(segmentationId: string): ArrayBuffer;
}

export interface IDicomSegManager {
  importDicomSeg(datasetBuffer: ArrayBuffer): any;
  exportDicomSeg(segmentationId: string): ArrayBuffer;
}

export interface IMeasurement {
  measurementId: string;
  type: 'LENGTH' | 'ANGLE' | 'BIDIRECTIONAL' | 'RECTANGLE' | 'ELLIPSE' | 'POLYGON';
  viewportId: string;
  label: string;
  value: number;
  unit: string;
  points: Array<[number, number, number]>;
  stats: {
    min?: number;
    max?: number;
    mean?: number;
    stdDev?: number;
  };
}

export interface IMeasurementManager {
  addMeasurement(measurement: IMeasurement): void;
  removeMeasurement(measurementId: string): void;
  getMeasurementsForViewport(viewportId: string): IMeasurement[];
  getAllMeasurements(): IMeasurement[];
}

export interface IAnnotation {
  annotationId: string;
  type: 'TEXT' | 'ARROW' | 'FREEHAND' | 'BOOKMARK';
  viewportId: string;
  text?: string;
  points: Array<[number, number, number]>;
}

export interface IAnnotationManager {
  addAnnotation(annotation: IAnnotation): void;
  removeAnnotation(annotationId: string): void;
  getAnnotationsForViewport(viewportId: string): IAnnotation[];
}

export interface IClinicalSessionManager {
  setActiveTool(toolName: string): void;
  getActiveTool(): string;
  undo(): void;
  redo(): void;
}

// Phase 9 Enterprise Registration, Fusion & Advanced Clinical Interfaces
export type Matrix4x4 = number[];

export interface IRegistrationTransform {
  registrationId: string;
  referenceVolumeId: string;
  movingVolumeId: string;
  type: 'RIGID' | 'AFFINE';
  matrix: Matrix4x4;
}

export interface IRegistrationManager {
  registerVolumes(referenceVolumeId: string, movingVolumeId: string, type?: 'RIGID' | 'AFFINE'): IRegistrationTransform;
  getTransform(registrationId: string): IRegistrationTransform | undefined;
}

export interface ITransformManager {
  createIdentity(): Matrix4x4;
  multiply(a: Matrix4x4, b: Matrix4x4): Matrix4x4;
  invert(m: Matrix4x4): Matrix4x4;
}

export interface ILandmarkPair {
  id: string;
  referencePoint: [number, number, number];
  movingPoint: [number, number, number];
}

export interface ILandmarkManager {
  addLandmarkPair(pair: ILandmarkPair): void;
  getLandmarkPairs(): ILandmarkPair[];
}

export interface IFusionSession {
  fusionId: string;
  referenceVolumeId: string;
  overlayVolumeId: string;
  blendMode: 'ALPHA' | 'MAXIMUM_INTENSITY' | 'DIFFERENCE' | 'OVERLAY';
  opacity: number;
  colorMap: string;
}

export interface IFusionManager {
  createFusion(referenceVolumeId: string, overlayVolumeId: string): IFusionSession;
  setBlendMode(fusionId: string, mode: 'ALPHA' | 'MAXIMUM_INTENSITY' | 'DIFFERENCE' | 'OVERLAY'): void;
  setOpacity(fusionId: string, opacity: number): void;
  setColorMap(fusionId: string, colorMap: string): void;
}

export interface IFusionViewportController {
  readonly viewportId: string;
  bindFusion(fusionId: string): Promise<void>;
  render(): void;
  destroy(): void;
}

export interface ICPRPath {
  cprId: string;
  volumeId: string;
  controlPoints: Array<[number, number, number]>;
}

export interface ICPRManager {
  generateCPR(volumeId: string, controlPoints: Array<[number, number, number]>): ICPRPath;
}

export interface IVesselCenterline {
  vesselId: string;
  label: string;
  points: Array<[number, number, number]>;
  radii: number[];
}

export interface IVesselTrackingManager {
  trackVessel(volumeId: string, seedPoint: [number, number, number]): IVesselCenterline;
}

// Phase 10 Infrastructure Interfaces
export interface IAIModelMetadata {
  modelId: string;
  name: string;
  version: string;
  taskType: 'SEGMENTATION' | 'DETECTION' | 'CLASSIFICATION' | 'REGISTRATION' | 'REPORT_GENERATION' | 'RADIOMICS' | 'LLM';
  inputFormat: string;
  outputFormat: string;
  gpuMemoryMB: number;
  cpuCores: number;
  supportedModalities: string[];
  confidenceThreshold: number;
  status: 'REGISTERED' | 'LOADED' | 'UNLOADED' | 'ERROR';
}

export interface IAIModelRegistry {
  registerModel(model: IAIModelMetadata): void;
  getModel(modelId: string): IAIModelMetadata | undefined;
  getAllModels(): IAIModelMetadata[];
  unregisterModel(modelId: string): void;
}

export interface IAIModelManager {
  loadModel(modelId: string): Promise<void>;
  unloadModel(modelId: string): Promise<void>;
  isModelLoaded(modelId: string): boolean;
}

export interface IAIJob {
  jobId: string;
  modelId: string;
  targetId: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progressPercent: number;
  result?: any;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export interface IAIJobManager {
  createJob(modelId: string, targetId: string): IAIJob;
  cancelJob(jobId: string): void;
  getJob(jobId: string): IAIJob | undefined;
  getAllJobs(): IAIJob[];
}

export interface IGPUResourceManager {
  allocateMemory(mb: number): boolean;
  releaseMemory(mb: number): void;
  getAvailableMemoryMB(): number;
  getTotalMemoryMB(): number;
}

export interface IModelCacheManager {
  cacheTensorBuffer(key: string, buffer: ArrayBuffer): void;
  getTensorBuffer(key: string): ArrayBuffer | undefined;
  clearCache(): void;
}

export interface IAIResultRepository {
  saveResult(targetId: string, result: any): void;
  getResult(targetId: string): any | undefined;
}

export interface IAIPlatform {
  registerModel(model: IAIModelMetadata): void;
  runInference(modelId: string, targetId: string): Promise<IAIJob>;
  getJob(jobId: string): IAIJob | undefined;
  getResults(targetId: string): any;
}

// Phase 10 Enterprise AI Applications, Reporting & Workflow Interfaces
export interface IAIDetectionFinding {
  detectionId: string;
  label: string;
  category: 'ORGAN' | 'LESION' | 'FRACTURE' | 'NODULE' | 'HEMORRHAGE';
  confidence: number;
  boundingBox: number[]; // [minX, minY, minZ, maxX, maxY, maxZ]
  volumeId: string;
}

export interface IDetectionManager {
  detectLesions(volumeId: string, category?: string): Promise<IAIDetectionFinding[]>;
}

export interface IStructuredReport {
  reportId: string;
  studyInstanceUid: string;
  findings: string[];
  impressions: string[];
  recommendations: string[];
  createdAt: number;
}

export interface IStructuredReportManager {
  createReport(studyInstanceUid: string): IStructuredReport;
  exportReport(reportId: string, format: 'PDF' | 'DICOM_SR'): ArrayBuffer;
}

export interface IWorkflowTask {
  taskId: string;
  studyInstanceUid: string;
  assignedRadiologist: string;
  priority: 'STAT' | 'HIGH' | 'ROUTINE';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
}

export interface IWorkflowManager {
  assignCase(studyInstanceUid: string, radiologistId: string, priority?: 'STAT' | 'HIGH' | 'ROUTINE'): IWorkflowTask;
  getAuditTrail(): string[];
}

export interface IWadoClientOptions {
  baseUrl?: string;
  wadoRsUrl?: string;
  qidoRsUrl?: string;
  wadoUriUrl?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface IWadoClient {
  fetchStudyMetadata(studyUid: string): Promise<any[]>;
  fetchSeriesMetadata(studyUid: string, seriesUid: string): Promise<any[]>;
  fetchInstanceMetadata(studyUid: string, seriesUid: string, sopUid: string): Promise<any>;
}

export interface IDicomMetadataStore {
  addInstance(instance: any): void;
  addInstances(instances: any[]): void;
  getInstance(sopUid: string): any;
  getInstanceByImageId(imageId: string): any;
  getSeriesInstances(seriesUid: string): any[];
  clear(): void;
}

export interface IStudyRepository {
  addStudy(study: any): void;
  getStudy(studyUid: string): any | undefined;
  getAllStudies(): any[];
  removeStudy(studyUid: string): void;
  clear(): void;
}

export interface IEngineContext {
  readonly eventBus: IEventBus;
  readonly logger: IEngineLogger;
  readonly performanceMonitor: IPerformanceMonitor;
  readonly commandBus: ICommandBus;
  readonly stateStore: IEngineStateStore;

  // Phase 2 Services
  renderingEngineManager?: IRenderingEngineManager;
  cornerstoneBootstrap?: ICornerstoneBootstrap;

  // Phase 3 DICOM Services
  wadoClient?: IWadoClient;
  metadataStore?: IDicomMetadataStore;
  studyRepository?: IStudyRepository;
  studyLoader?: any;
  seriesLoader?: any;
  instanceLoader?: any;
  displaySetBuilder?: any;
  imageIdBuilder?: any;

  // Phase 4 Viewport Services
  viewportRegistry?: IViewportRegistry;
  viewportManager?: IViewportManager;

  // Phase 5 Volume Engine Services
  volumeBuilder?: IVolumeBuilder;
  volumeRepository?: IVolumeRepository;
  volumeCacheManager?: IVolumeCacheManager;
  presetManager?: IPresetManager;
  volumeFactory?: IVolumeFactory;
  volumeLifecycleManager?: IVolumeLifecycleManager;

  // Phase 6 Enterprise MPR Services
  orientationManager?: IOrientationManager;
  crosshairManager?: ICrosshairManager;
  referenceLineManager?: IReferenceLineManager;
  cameraSynchronizer?: ICameraSynchronizer;
  sliceSynchronizer?: ISliceSynchronizer;
  voiSynchronizer?: IVOISynchronizer;
  mprViewportLayout?: IMPRViewportLayout;
  mprWorkspaceManager?: IMPRWorkspaceManager;

  // Phase 7 Enterprise 3D Volume Rendering Services - REMOVED

  // Phase 8 Enterprise Segmentation & Clinical Services
  segmentationManager?: ISegmentationManager;
  segmentationRepository?: ISegmentationRepository;
  labelMapManager?: ILabelMapManager;
  rtStructManager?: IRTStructManager;
  dicomSegManager?: IDicomSegManager;
  measurementManager?: IMeasurementManager;
  annotationManager?: IAnnotationManager;
  clinicalSessionManager?: IClinicalSessionManager;

  // Phase 9 Advanced Clinical Visualization Services
  registrationManager?: IRegistrationManager;
  transformManager?: ITransformManager;
  landmarkManager?: ILandmarkManager;
  fusionManager?: IFusionManager;
  cprManager?: ICPRManager;
  vesselTrackingManager?: IVesselTrackingManager;

  // Phase 10 AI Platform Infrastructure Services
  aiModelRegistry?: IAIModelRegistry;
  aiModelManager?: IAIModelManager;
  gpuResourceManager?: IGPUResourceManager;
  modelCacheManager?: IModelCacheManager;
  aiJobManager?: IAIJobManager;
  aiResultRepository?: IAIResultRepository;
  aiPlatform?: IAIPlatform;

  // Phase 10 AI Applications, Reporting & Workflow Services
  detectionManager?: IDetectionManager;
  segmentationInferenceManager?: any;
  classificationManager?: any;
  reportGenerationManager?: any;
  heatmapManager?: any;
  confidenceManager?: any;
  clinicalDecisionManager?: any;
  aiOverlayManager?: any;

  structuredReportManager?: IStructuredReportManager;
  findingManager?: any;
  impressionManager?: any;
  recommendationManager?: any;
  templateManager?: any;

  workflowManager?: IWorkflowManager;
  casePriorityManager?: any;
  notificationManager?: any;
  taskQueueManager?: any;
  studyAssignmentManager?: any;
  auditWorkflowManager?: any;

  // Future service slots
  toolManager?: any;
  syncManager?: any;
}

export interface IEngineConfig {
  debug?: boolean;
  maxWebWorkers?: number;
  preferWadoRs?: boolean;
  gpuMemoryLimitMB?: number;
  apiBaseUrl?: string;
}

export interface IImagingEngineFacade {
  initialize(config?: IEngineConfig): Promise<void>;
  shutdown(): Promise<void>;
  isInitialized(): boolean;
  loadStudy(studyInstanceUid: string): Promise<any>;
  createViewport(options: IViewportCreationOptions): Promise<any>;
  destroyViewport(viewportId: string): Promise<void>;
  bindDisplaySetToViewport(viewportId: string, displaySetOrUid: any): Promise<void>;
  createAndLoadVolume(displaySet: any): Promise<any>;
  bindVolumeToViewport(viewportId: string, volumeId: string): Promise<void>;
  initializeMPRWorkspace(containers: {
    axial: HTMLDivElement;
    sagittal: HTMLDivElement;
    coronal: HTMLDivElement;
    stackOr3d?: HTMLDivElement;
  }, volumeId: string, layout?: '1x3' | '2x2' | '3+1' | 'SINGLE'): Promise<void>;
  switchMPRLayout(layout: '1x3' | '2x2' | '3+1' | 'SINGLE'): void;
  destroyMPRWorkspace(): Promise<void>;
  setCrosshairPosition(pos: [number, number, number], sourceViewportId?: string): void;
  create3DViewport(viewportId: string, container: HTMLDivElement): Promise<IVolume3DViewportController>;
  bindVolumeTo3D(viewportId: string, volumeId: string, presetName?: string): Promise<void>;
  set3DPreset(viewportId: string, presetName: string): void;
  set3DQuality(viewportId: string, level: 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA'): void;
  createSegmentation(label: string, volumeId: string): ISegmentation;
  addMeasurement(measurement: IMeasurement): void;
  addAnnotation(annotation: IAnnotation): void;
  registerVolumes(referenceVolumeId: string, movingVolumeId: string, type?: 'RIGID' | 'AFFINE'): IRegistrationTransform;
  createFusion(referenceVolumeId: string, overlayVolumeId: string): IFusionSession;
  generateCPR(volumeId: string, controlPoints: Array<[number, number, number]>): ICPRPath;
  trackVessel(volumeId: string, seedPoint: [number, number, number]): IVesselCenterline;
  registerAIModel(model: IAIModelMetadata): void;
  runInferenceJob(modelId: string, targetId: string): Promise<IAIJob>;
  detectLesions(volumeId: string, category?: string): Promise<IAIDetectionFinding[]>;
  createStructuredReport(studyInstanceUid: string): IStructuredReport;
  assignCase(studyInstanceUid: string, radiologistId: string, priority?: 'STAT' | 'HIGH' | 'ROUTINE'): IWorkflowTask;
  executeCommand<T = any>(commandName: string, payload?: any): Promise<T>;
  on<T = any>(event: EngineEvents | string, callback: (payload: T) => void): () => void;
  getState(): Readonly<IEngineHeadlessState>;
}
