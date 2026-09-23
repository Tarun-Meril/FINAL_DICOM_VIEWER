/**
 * Public Facade API for MedView PRO Medical Imaging Workstation Engine
 */

import {
  IAIDetectionFinding,
  IAIJob,
  IAIModelMetadata,
  IAnnotation,
  ICPRPath,
  IEngineConfig,
  IEngineHeadlessState,
  IFusionSession,
  IImagingEngineFacade,
  IMeasurement,
  IPerformanceMetrics,
  IRegistrationTransform,
  ISegmentation,
  IStackViewportController,
  IStructuredReport,
  IViewportCreationOptions,
  IVesselCenterline,
  IVolume3DViewportController,
  IVolumeDescriptor,
  IWorkflowTask,
} from '../types/contracts';
import { EngineEvents } from '../types/events';
import { EngineContext } from '../core/EngineContext';
import { initImagingEngine, shutdownImagingEngine } from '../init';
import { Study, DisplaySet } from '../domain/entities/DicomEntities';

export class ImagingEngineImpl implements IImagingEngineFacade {
  private context: EngineContext;

  constructor() {
    this.context = new EngineContext(true);
    this.registerCoreCommands();
  }

  private registerCoreCommands(): void {
    // OpenStudy Command
    this.context.commandBus.registerCommand('OpenStudy', async (ctx, payload) => {
      const studyUid = typeof payload === 'string' ? payload : payload?.studyInstanceUid;
      if (!studyUid) throw new Error('OpenStudy command requires studyInstanceUid');
      return ctx.studyLoader!.loadStudy(studyUid);
    });

    // CreateViewport Command
    this.context.commandBus.registerCommand('CreateViewport', async (ctx, payload: IViewportCreationOptions) => {
      return ctx.viewportManager!.createViewport(payload);
    });

    // DestroyViewport Command
    this.context.commandBus.registerCommand('DestroyViewport', async (ctx, payload) => {
      const vpId = typeof payload === 'string' ? payload : payload?.viewportId;
      return ctx.viewportManager!.destroyViewport(vpId);
    });

    // CreateVolume Command
    this.context.commandBus.registerCommand('CreateVolume', async (ctx, payload: DisplaySet) => {
      return ctx.volumeLifecycleManager!.createAndLoadVolume(payload);
    });

    // BindVolume Command
    this.context.commandBus.registerCommand('BindVolume', async (ctx, payload) => {
      const { viewportId, volumeId } = payload;
      const controller = ctx.viewportRegistry?.getController(viewportId);
      if (controller && typeof controller.bindVolume === 'function') {
        return controller.bindVolume(volumeId);
      }
      throw new Error(`[ImagingEngine] Viewport ${viewportId} does not support bindVolume`);
    });

    // InitializeMPR Command
    this.context.commandBus.registerCommand('InitializeMPR', async (ctx, payload) => {
      const { containers, volumeId, layout } = payload;
      return ctx.mprWorkspaceManager!.initializeMPRWorkspace(containers, volumeId, layout);
    });

    // SwitchMPRLayout Command
    this.context.commandBus.registerCommand('SwitchMPRLayout', (ctx, payload) => {
      const layout = typeof payload === 'string' ? payload : payload?.layout;
      return ctx.mprWorkspaceManager!.switchLayout(layout);
    });

    // SetCrosshairPosition Command
    this.context.commandBus.registerCommand('SetCrosshairPosition', (ctx, payload) => {
      const { position, sourceViewportId } = payload;
      return ctx.crosshairManager!.setWorldPosition(position, sourceViewportId);
    });

    // Create3DViewport Command
    this.context.commandBus.registerCommand('Create3DViewport', async (ctx, payload) => {
      const { viewportId, container } = payload;
      return ctx.volumeRenderingManager!.create3DViewport(viewportId, container);
    });

    // BindVolumeTo3D Command
    this.context.commandBus.registerCommand('BindVolumeTo3D', async (ctx, payload) => {
      const { viewportId, volumeId, presetName } = payload;
      return ctx.volumeRenderingManager!.bindVolumeTo3D(viewportId, volumeId, presetName);
    });

    // Set3DPreset Command
    this.context.commandBus.registerCommand('Set3DPreset', (ctx, payload) => {
      const { viewportId, presetName } = payload;
      const controller = ctx.viewportRegistry?.getController(viewportId);
      if (controller && typeof controller.setPreset === 'function') {
        controller.setPreset(presetName);
      }
    });

    // Set3DQuality Command
    this.context.commandBus.registerCommand('Set3DQuality', (ctx, payload) => {
      const { viewportId, level } = payload;
      const controller = ctx.viewportRegistry?.getController(viewportId);
      if (controller && typeof controller.setQuality === 'function') {
        controller.setQuality(level);
      }
    });

    // CreateSegmentation Command
    this.context.commandBus.registerCommand('CreateSegmentation', (ctx, payload) => {
      const { label, volumeId } = payload;
      return ctx.segmentationManager!.createSegmentation(label, volumeId);
    });

    // AddMeasurement Command
    this.context.commandBus.registerCommand('AddMeasurement', (ctx, payload: IMeasurement) => {
      return ctx.measurementManager!.addMeasurement(payload);
    });

    // AddAnnotation Command
    this.context.commandBus.registerCommand('AddAnnotation', (ctx, payload: IAnnotation) => {
      return ctx.annotationManager!.addAnnotation(payload);
    });

    // SetActiveTool Command
    this.context.commandBus.registerCommand('SetActiveTool', (ctx, payload) => {
      const toolName = typeof payload === 'string' ? payload : payload?.toolName;
      return ctx.clinicalSessionManager!.setActiveTool(toolName);
    });

    // RegisterVolumes Command
    this.context.commandBus.registerCommand('RegisterVolumes', (ctx, payload) => {
      const { referenceVolumeId, movingVolumeId, type } = payload;
      return ctx.registrationManager!.registerVolumes(referenceVolumeId, movingVolumeId, type);
    });

    // CreateFusion Command
    this.context.commandBus.registerCommand('CreateFusion', (ctx, payload) => {
      const { referenceVolumeId, overlayVolumeId } = payload;
      return ctx.fusionManager!.createFusion(referenceVolumeId, overlayVolumeId);
    });

    // GenerateCPR Command
    this.context.commandBus.registerCommand('GenerateCPR', (ctx, payload) => {
      const { volumeId, controlPoints } = payload;
      return ctx.cprManager!.generateCPR(volumeId, controlPoints);
    });

    // TrackVessel Command
    this.context.commandBus.registerCommand('TrackVessel', (ctx, payload) => {
      const { volumeId, seedPoint } = payload;
      return ctx.vesselTrackingManager!.trackVessel(volumeId, seedPoint);
    });

    // RegisterAIModel Command
    this.context.commandBus.registerCommand('RegisterAIModel', (ctx, payload: IAIModelMetadata) => {
      return ctx.aiPlatform!.registerModel(payload);
    });

    // RunInferenceJob Command
    this.context.commandBus.registerCommand('RunInferenceJob', async (ctx, payload) => {
      const { modelId, targetId } = payload;
      return ctx.aiPlatform!.runInference(modelId, targetId);
    });

    // DetectLesions Command
    this.context.commandBus.registerCommand('DetectLesions', async (ctx, payload) => {
      const { volumeId, category } = payload;
      return ctx.detectionManager!.detectLesions(volumeId, category);
    });

    // CreateStructuredReport Command
    this.context.commandBus.registerCommand('CreateStructuredReport', (ctx, payload) => {
      const studyInstanceUid = typeof payload === 'string' ? payload : payload?.studyInstanceUid;
      return ctx.structuredReportManager!.createReport(studyInstanceUid);
    });

    // AssignCase Command
    this.context.commandBus.registerCommand('AssignCase', (ctx, payload) => {
      const { studyInstanceUid, radiologistId, priority } = payload;
      return ctx.workflowManager!.assignCase(studyInstanceUid, radiologistId, priority);
    });

    // GenerateSupportBundle Command
    this.context.commandBus.registerCommand('GenerateSupportBundle', (ctx) => {
      return ctx.supportBundleManager!.generateSupportBundle();
    });

    // CheckForUpdates Command
    this.context.commandBus.registerCommand('CheckForUpdates', (ctx) => {
      ctx.updateManager!.checkForUpdates();
    });

    // GetReleaseInfo Command
    this.context.commandBus.registerCommand('GetReleaseInfo', (ctx) => {
      return ctx.versionManager!.getVersionInfo();
    });

    // RunDiagnostics Command
    this.context.commandBus.registerCommand('RunDiagnostics', async (ctx) => {
      return ctx.diagnosticManager!.runFullDiagnostics();
    });

    // ValidateDicomCompliance Command
    this.context.commandBus.registerCommand('ValidateDicomCompliance', (ctx, payload) => {
      return ctx.dicomValidator!.validateDataset(payload);
    });

    // CheckAuthorization Command
    this.context.commandBus.registerCommand('CheckAuthorization', (ctx, payload) => {
      const { user, action } = payload;
      return ctx.authorizationManager!.checkPermission(user, action);
    });

    // LogAuditEvent Command
    this.context.commandBus.registerCommand('LogAuditEvent', (ctx, payload) => {
      const { user, eventType, resourceId, details } = payload;
      ctx.auditManager!.logEvent(user, eventType, resourceId, details);
    });

    // GetLicenseStatus Command
    this.context.commandBus.registerCommand('GetLicenseStatus', (ctx) => {
      return ctx.licenseManager!.getLicenseStatus();
    });

    // CreateSystemBackup Command
    this.context.commandBus.registerCommand('CreateSystemBackup', async (ctx) => {
      return ctx.backupRecoveryManager!.createBackup();
    });

    // StreamStudyProgressively Command
    this.context.commandBus.registerCommand('StreamStudyProgressively', async (ctx, payload) => {
      const studyInstanceUid = typeof payload === 'string' ? payload : payload?.studyInstanceUid;
      return ctx.progressiveStudyLoader!.loadStudyProgressively(studyInstanceUid);
    });

    // SetAdaptiveRendering Command
    this.context.commandBus.registerCommand('SetAdaptiveRendering', (ctx, payload) => {
      const interacting = typeof payload === 'boolean' ? payload : payload?.interacting;
      ctx.adaptiveRenderingManager!.setInteractionState(interacting);
    });

    // SyncMonitors Command
    this.context.commandBus.registerCommand('SyncMonitors', (ctx) => {
      ctx.displaySynchronizationManager!.syncDisplays();
    });

    // CheckHealth Command
    this.context.commandBus.registerCommand('CheckHealth', (ctx) => {
      return ctx.healthMonitor!.checkHealth();
    });

    // GetPerformanceMetrics Command
    this.context.commandBus.registerCommand('GetPerformanceMetrics', (ctx) => {
      return ctx.performanceMonitor.getMetrics();
    });

    // RunBenchmark Command
    this.context.commandBus.registerCommand('RunBenchmark', async (ctx) => {
      return ctx.benchmarkManager!.runFullBenchmark();
    });

    // ClearPerformanceCache Command
    this.context.commandBus.registerCommand('ClearPerformanceCache', (ctx) => {
      ctx.cacheHierarchyManager!.clear();
    });

    // SetPreset Command
    this.context.commandBus.registerCommand('SetPreset', (ctx, payload) => {
      const { name } = payload;
      const preset = ctx.presetManager!.getPreset(name);
      if (!preset) throw new Error(`Preset ${name} not found`);
      return preset;
    });

    // Viewport Interactions Commands
    this.context.commandBus.registerCommand('NextSlice', (ctx, payload) => {
      const vpId = payload?.viewportId || ctx.viewportManager!.getActiveViewportId();
      if (vpId) ctx.viewportRegistry?.getController(vpId)?.nextSlice();
    });

    this.context.commandBus.registerCommand('PreviousSlice', (ctx, payload) => {
      const vpId = payload?.viewportId || ctx.viewportManager!.getActiveViewportId();
      if (vpId) ctx.viewportRegistry?.getController(vpId)?.previousSlice();
    });

    this.context.commandBus.registerCommand('SetSlice', (ctx, payload) => {
      const vpId = payload?.viewportId || ctx.viewportManager!.getActiveViewportId();
      const idx = payload?.sliceIndex ?? payload?.index ?? 0;
      if (vpId) ctx.viewportRegistry?.getController(vpId)?.setSlice(idx);
    });

    this.context.commandBus.registerCommand('ResetViewport', (ctx, payload) => {
      const vpId = payload?.viewportId || ctx.viewportManager!.getActiveViewportId();
      if (vpId) ctx.viewportRegistry?.getController(vpId)?.reset();
    });

    this.context.commandBus.registerCommand('Zoom', (ctx, payload) => {
      const vpId = payload?.viewportId || ctx.viewportManager!.getActiveViewportId();
      const factor = payload?.factor || 1.1;
      if (vpId) ctx.viewportRegistry?.getController(vpId)?.zoom(factor);
    });

    this.context.commandBus.registerCommand('Pan', (ctx, payload) => {
      const vpId = payload?.viewportId || ctx.viewportManager!.getActiveViewportId();
      const dx = payload?.deltaX || 0;
      const dy = payload?.deltaY || 0;
      if (vpId) ctx.viewportRegistry?.getController(vpId)?.pan(dx, dy);
    });

    this.context.commandBus.registerCommand('SetWindowLevel', (ctx, payload) => {
      const vpId = payload?.viewportId || ctx.viewportManager!.getActiveViewportId();
      const ww = payload?.windowWidth || 400;
      const wl = payload?.windowLevel || 40;
      if (vpId) {
        ctx.voiSynchronizer?.syncVOI(ww, wl, vpId);
      }
    });
  }

  public async initialize(config?: IEngineConfig): Promise<void> {
    const isDebug = config?.debug !== undefined ? config.debug : true;
    (this.context.logger as any).setDebugEnabled(isDebug);

    if (config?.apiBaseUrl && this.context.wadoClient) {
      (this.context.wadoClient as any).setBaseUrl(config.apiBaseUrl);
    }

    await initImagingEngine(this.context, config);
  }

  public async shutdown(): Promise<void> {
    await shutdownImagingEngine(this.context);
  }

  public isInitialized(): boolean {
    return this.context.stateStore.getState().initialized;
  }

  public async loadStudy(studyInstanceUid: string): Promise<Study> {
    if (!this.context.studyLoader) {
      throw new Error('StudyLoader is not initialized');
    }
    return this.context.studyLoader.loadStudy(studyInstanceUid);
  }

  public async streamStudyProgressively(studyInstanceUid: string): Promise<void> {
    if (!this.context.progressiveStudyLoader) {
      throw new Error('ProgressiveStudyLoader is not initialized');
    }
    return this.context.progressiveStudyLoader.loadStudyProgressively(studyInstanceUid);
  }

  public async createViewport(options: IViewportCreationOptions): Promise<IStackViewportController> {
    if (!this.context.viewportManager) {
      throw new Error('ViewportManager is not initialized');
    }
    return this.context.viewportManager.createViewport(options);
  }

  public async destroyViewport(viewportId: string): Promise<void> {
    if (this.context.viewportManager) {
      await this.context.viewportManager.destroyViewport(viewportId);
    }
  }

  public async bindDisplaySetToViewport(viewportId: string, displaySetOrUid: any): Promise<void> {
    const controller = this.context.viewportRegistry?.getController(viewportId);
    if (!controller) {
      throw new Error(`[ImagingEngine] Viewport ${viewportId} controller is not found`);
    }

    let displaySet: DisplaySet | undefined;
    if (displaySetOrUid instanceof DisplaySet) {
      displaySet = displaySetOrUid;
    } else if (typeof displaySetOrUid === 'string') {
      const studies = this.context.studyRepository?.getAllStudies() || [];
      for (const study of studies) {
        for (const series of study.seriesList) {
          const found = series.displaySets.find((ds) => ds.displaySetInstanceUID === displaySetOrUid);
          if (found) {
            displaySet = found;
            break;
          }
        }
        if (displaySet) break;
      }
    }

    if (!displaySet) {
      throw new Error(`[ImagingEngine] DisplaySet ${displaySetOrUid} could not be resolved`);
    }

    await controller.bindDisplaySet(displaySet);
  }

  public async createAndLoadVolume(displaySet: DisplaySet): Promise<IVolumeDescriptor> {
    if (!this.context.volumeLifecycleManager) {
      throw new Error('VolumeLifecycleManager is not initialized');
    }
    return this.context.volumeLifecycleManager.createAndLoadVolume(displaySet);
  }

  public async bindVolumeToViewport(viewportId: string, volumeId: string): Promise<void> {
    return this.executeCommand('BindVolume', { viewportId, volumeId });
  }

  public async initializeMPRWorkspace(
    containers: {
      axial: HTMLDivElement;
      sagittal: HTMLDivElement;
      coronal: HTMLDivElement;
      stackOr3d?: HTMLDivElement;
    },
    volumeId: string,
    layout: '1x3' | '2x2' | '3+1' | 'SINGLE' = '2x2'
  ): Promise<void> {
    if (!this.context.mprWorkspaceManager) {
      throw new Error('MPRWorkspaceManager is not initialized');
    }
    return this.context.mprWorkspaceManager.initializeMPRWorkspace(containers, volumeId, layout);
  }

  public switchMPRLayout(layout: '1x3' | '2x2' | '3+1' | 'SINGLE'): void {
    if (this.context.mprWorkspaceManager) {
      this.context.mprWorkspaceManager.switchLayout(layout);
    }
  }

  public async destroyMPRWorkspace(): Promise<void> {
    if (this.context.mprWorkspaceManager) {
      await this.context.mprWorkspaceManager.destroyMPRWorkspace();
    }
  }

  public setCrosshairPosition(pos: [number, number, number], sourceViewportId?: string): void {
    if (this.context.crosshairManager) {
      this.context.crosshairManager.setWorldPosition(pos, sourceViewportId);
    }
  }

  public async create3DViewport(viewportId: string, container: HTMLDivElement): Promise<IVolume3DViewportController> {
    if (!this.context.volumeRenderingManager) {
      throw new Error('VolumeRenderingManager is not initialized');
    }
    return this.context.volumeRenderingManager.create3DViewport(viewportId, container);
  }

  public async bindVolumeTo3D(viewportId: string, volumeId: string, presetName?: string): Promise<void> {
    if (!this.context.volumeRenderingManager) {
      throw new Error('VolumeRenderingManager is not initialized');
    }
    return this.context.volumeRenderingManager.bindVolumeTo3D(viewportId, volumeId, presetName);
  }

  public set3DPreset(viewportId: string, presetName: string): void {
    return this.executeCommand('Set3DPreset', { viewportId, presetName });
  }

  public set3DQuality(viewportId: string, level: 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA'): void {
    return this.executeCommand('Set3DQuality', { viewportId, level });
  }

  public createSegmentation(label: string, volumeId: string): ISegmentation {
    if (!this.context.segmentationManager) {
      throw new Error('SegmentationManager is not initialized');
    }
    return this.context.segmentationManager.createSegmentation(label, volumeId);
  }

  public addMeasurement(measurement: IMeasurement): void {
    if (!this.context.measurementManager) {
      throw new Error('MeasurementManager is not initialized');
    }
    this.context.measurementManager.addMeasurement(measurement);
  }

  public addAnnotation(annotation: IAnnotation): void {
    if (!this.context.annotationManager) {
      throw new Error('AnnotationManager is not initialized');
    }
    this.context.annotationManager.addAnnotation(annotation);
  }

  public registerVolumes(referenceVolumeId: string, movingVolumeId: string, type: 'RIGID' | 'AFFINE' = 'RIGID'): IRegistrationTransform {
    if (!this.context.registrationManager) {
      throw new Error('RegistrationManager is not initialized');
    }
    return this.context.registrationManager.registerVolumes(referenceVolumeId, movingVolumeId, type);
  }

  public createFusion(referenceVolumeId: string, overlayVolumeId: string): IFusionSession {
    if (!this.context.fusionManager) {
      throw new Error('FusionManager is not initialized');
    }
    return this.context.fusionManager.createFusion(referenceVolumeId, overlayVolumeId);
  }

  public generateCPR(volumeId: string, controlPoints: Array<[number, number, number]>): ICPRPath {
    if (!this.context.cprManager) {
      throw new Error('CPRManager is not initialized');
    }
    return this.context.cprManager.generateCPR(volumeId, controlPoints);
  }

  public trackVessel(volumeId: string, seedPoint: [number, number, number]): IVesselCenterline {
    if (!this.context.vesselTrackingManager) {
      throw new Error('VesselTrackingManager is not initialized');
    }
    return this.context.vesselTrackingManager.trackVessel(volumeId, seedPoint);
  }

  public registerAIModel(model: IAIModelMetadata): void {
    if (!this.context.aiPlatform) {
      throw new Error('AIPlatform is not initialized');
    }
    this.context.aiPlatform.registerModel(model);
  }

  public async runInferenceJob(modelId: string, targetId: string): Promise<IAIJob> {
    if (!this.context.aiPlatform) {
      throw new Error('AIPlatform is not initialized');
    }
    return this.context.aiPlatform.runInference(modelId, targetId);
  }

  public async detectLesions(volumeId: string, category: string = 'LESION'): Promise<IAIDetectionFinding[]> {
    if (!this.context.detectionManager) {
      throw new Error('DetectionManager is not initialized');
    }
    return this.context.detectionManager.detectLesions(volumeId, category);
  }

  public createStructuredReport(studyInstanceUid: string): IStructuredReport {
    if (!this.context.structuredReportManager) {
      throw new Error('StructuredReportManager is not initialized');
    }
    return this.context.structuredReportManager.createReport(studyInstanceUid);
  }

  public assignCase(studyInstanceUid: string, radiologistId: string, priority: 'STAT' | 'HIGH' | 'ROUTINE' = 'ROUTINE'): IWorkflowTask {
    if (!this.context.workflowManager) {
      throw new Error('WorkflowManager is not initialized');
    }
    return this.context.workflowManager.assignCase(studyInstanceUid, radiologistId, priority);
  }

  public validateDicomCompliance(dataset: any): { valid: boolean; errors: string[] } {
    if (!this.context.dicomValidator) {
      throw new Error('DicomValidator is not initialized');
    }
    return this.context.dicomValidator.validateDataset(dataset);
  }

  public checkAuthorization(user: string, action: string): boolean {
    if (!this.context.authorizationManager) {
      throw new Error('AuthorizationManager is not initialized');
    }
    return this.context.authorizationManager.checkPermission(user, action);
  }

  public logAuditEvent(user: string, eventType: string, resourceId: string, details?: any): void {
    if (!this.context.auditManager) {
      throw new Error('AuditManager is not initialized');
    }
    this.context.auditManager.logEvent(user, eventType, resourceId, details);
  }

  public getLicenseStatus(): { valid: boolean; tier: string } {
    if (!this.context.licenseManager) {
      throw new Error('LicenseManager is not initialized');
    }
    return this.context.licenseManager.getLicenseStatus();
  }

  public async createSystemBackup(): Promise<string> {
    if (!this.context.backupRecoveryManager) {
      throw new Error('BackupRecoveryManager is not initialized');
    }
    return this.context.backupRecoveryManager.createBackup();
  }

  public generateSupportBundle(): ArrayBuffer {
    if (!this.context.supportBundleManager) {
      throw new Error('SupportBundleManager is not initialized');
    }
    return this.context.supportBundleManager.generateSupportBundle();
  }

  public getReleaseInfo(): { version: string; buildNumber: number; engineName: string } {
    if (!this.context.versionManager) {
      throw new Error('VersionManager is not initialized');
    }
    return this.context.versionManager.getVersionInfo();
  }

  public async runDiagnostics(): Promise<{ healthy: boolean; results: Record<string, boolean> }> {
    if (!this.context.diagnosticManager) {
      throw new Error('DiagnosticManager is not initialized');
    }
    return this.context.diagnosticManager.runFullDiagnostics();
  }

  public checkHealth(): { healthy: boolean; issues: string[] } {
    if (!this.context.healthMonitor) {
      throw new Error('HealthMonitor is not initialized');
    }
    return this.context.healthMonitor.checkHealth();
  }

  public getPerformanceMetrics(): Readonly<IPerformanceMetrics> {
    return this.context.performanceMonitor.getMetrics();
  }

  public async runBenchmark(): Promise<{ score: number; renderTimeMs: number }> {
    if (!this.context.benchmarkManager) {
      throw new Error('BenchmarkManager is not initialized');
    }
    return this.context.benchmarkManager.runFullBenchmark();
  }

  public executeCommand<T = any>(commandName: string, payload?: any): Promise<T> {
    return this.context.commandBus.executeCommand<T>(commandName, payload);
  }

  public on<T = any>(event: EngineEvents | string, callback: (payload: T) => void): () => void {
    return this.context.eventBus.on<T>(event, callback);
  }

  public getState(): Readonly<IEngineHeadlessState> {
    return this.context.stateStore.getState();
  }

  public getContext(): EngineContext {
    return this.context;
  }
}

// Singleton Public ImagingEngine instance
export const ImagingEngine = new ImagingEngineImpl();
