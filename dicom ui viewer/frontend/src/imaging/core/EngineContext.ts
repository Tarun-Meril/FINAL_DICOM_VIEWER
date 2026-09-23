/**
 * EngineContext Dependency Injection Container
 */

import {
  IAIJobManager,
  IAIModelManager,
  IAIModelRegistry,
  IAIPlatform,
  IAIResultRepository,
  IAnnotationManager,
  ICPRManager,
  ICameraSynchronizer,
  IClinicalSessionManager,
  IClippingPlaneManager,
  ICommandBus,
  ICornerstoneBootstrap,
  ICrosshairManager,
  IDetectionManager,
  IDicomMetadataStore,
  IDicomSegManager,
  IEngineContext,
  IEngineLogger,
  IEngineStateStore,
  IEventBus,
  IFusionManager,
  IGPUResourceManager,
  ILabelMapManager,
  ILandmarkManager,
  IMPRViewportLayout,
  IMPRWorkspaceManager,
  IMeasurementManager,
  IModelCacheManager,
  IOrientationManager,
  IPerformanceMonitor,
  IPresetManager,
  IRayCastingManager,
  IReferenceLineManager,
  IRegistrationManager,
  IRenderingEngineManager,
  IRenderingQualityManager,
  IRTStructManager,
  ISegmentationManager,
  ISegmentationRepository,
  ISliceSynchronizer,
  IStructuredReportManager,
  IStudyRepository,
  ITransferFunctionManager,
  ITransformManager,
  IVOISynchronizer,
  IVesselTrackingManager,
  IVolumeBuilder,
  IVolumeCacheManager,
  IVolumeFactory,
  IVolumeLifecycleManager,
  IVolumeRenderingManager,
  IVolumeRenderingPresetManager,
  IVolumeRepository,
  IViewportManager,
  IViewportRegistry,
  IWadoClient,
  IWorkflowManager,
} from '../types/contracts';
import { EventBus } from './EventBus';
import { EngineLogger } from './EngineLogger';
import { PerformanceMonitor } from './PerformanceMonitor';
import { CommandBus } from './CommandBus';
import { EngineStateStore } from '../state/EngineStateStore';
import { CornerstoneBootstrap } from '../infrastructure/cornerstone/CornerstoneBootstrap';
import { WadoClient } from '../dicom/WadoClient';
import { DicomMetadataStore } from '../metadata/DicomMetadataStore';
import { StudyRepository } from '../dicom/StudyRepository';
import { StudyLoader } from '../dicom/StudyLoader';
import { ViewportRegistry } from '../viewport/ViewportRegistry';
import { ViewportManager } from '../viewport/ViewportManager';
import { VolumeBuilder } from '../volume/VolumeBuilder';
import { VolumeRepository } from '../volume/VolumeRepository';
import { VolumeCacheManager } from '../volume/VolumeCacheManager';
import { PresetManager } from '../volume/PresetManager';
import { VolumeFactory } from '../volume/VolumeFactory';
import { VolumeLifecycleManager } from '../volume/VolumeLifecycleManager';
import { OrientationManager } from '../mpr/OrientationManager';
import { CrosshairManager } from '../mpr/CrosshairManager';
import { ReferenceLineManager } from '../mpr/ReferenceLineManager';
import { CameraSynchronizer } from '../mpr/CameraSynchronizer';
import { SliceSynchronizer } from '../mpr/SliceSynchronizer';
import { VOISynchronizer } from '../mpr/VOISynchronizer';
import { MPRViewportLayout } from '../viewport/MPRViewportLayout';
import { MPRWorkspaceManager } from '../mpr/MPRWorkspaceManager';
// Phase 7 Enterprise 3D Volume Rendering Services - REMOVED
import { SegmentationManager } from '../segmentation/SegmentationManager';
import { SegmentationRepository } from '../segmentation/SegmentationRepository';
import { LabelMapManager } from '../segmentation/LabelMapManager';
import { RTStructManager } from '../segmentation/RTStructManager';
import { DicomSegManager } from '../segmentation/DicomSegManager';
import { MeasurementManager } from '../clinical/MeasurementManager';
import { AnnotationManager } from '../clinical/AnnotationManager';
import { ClinicalSessionManager } from '../clinical/ClinicalSessionManager';
import { RegistrationManager } from '../registration/RegistrationManager';
import { TransformManager } from '../registration/TransformManager';
import { LandmarkManager } from '../registration/LandmarkManager';
import { FusionManager } from '../fusion/FusionManager';
import { CPRManager } from '../cpr/CPRManager';
import { VesselTrackingManager } from '../vessel/VesselTrackingManager';
import { AIModelRegistry } from '../ai/AIModelRegistry';
import { GPUResourceManager } from '../ai/GPUResourceManager';
import { ModelCacheManager } from '../ai/ModelCacheManager';
import { AIModelManager } from '../ai/AIModelManager';
import { AIResultRepository } from '../ai/AIResultRepository';
import { AIJobManager } from '../ai/AIJobManager';
import { AIPlatform } from '../ai/AIPlatform';
import { DetectionManager } from '../ai/DetectionManager';
import { SegmentationInferenceManager } from '../ai/SegmentationInferenceManager';
import { ClassificationManager } from '../ai/ClassificationManager';
import { ReportGenerationManager } from '../ai/ReportGenerationManager';
import { HeatmapManager } from '../ai/HeatmapManager';
import { ConfidenceManager } from '../ai/ConfidenceManager';
import { ClinicalDecisionManager } from '../ai/ClinicalDecisionManager';
import { AIOverlayManager } from '../ai/AIOverlayManager';
import { StructuredReportManager } from '../reporting/StructuredReportManager';
import { FindingManager } from '../reporting/FindingManager';
import { ImpressionManager } from '../reporting/ImpressionManager';
import { RecommendationManager } from '../reporting/RecommendationManager';
import { TemplateManager } from '../reporting/TemplateManager';
import { WorkflowManager } from '../workflow/WorkflowManager';
import { CasePriorityManager } from '../workflow/CasePriorityManager';
import { NotificationManager } from '../workflow/NotificationManager';
import { TaskQueueManager } from '../workflow/TaskQueueManager';
import { StudyAssignmentManager } from '../workflow/StudyAssignmentManager';
import { AuditWorkflowManager } from '../workflow/AuditWorkflowManager';

import { RenderingScheduler } from '../performance/RenderingScheduler';
import { FrameScheduler } from '../performance/FrameScheduler';
import { StreamingManager } from '../performance/StreamingManager';
import { StudyStreamingManager } from '../performance/StudyStreamingManager';
import { TileStreamingManager } from '../performance/TileStreamingManager';
import { PrefetchManager } from '../performance/PrefetchManager';
import { CacheHierarchyManager } from '../performance/CacheHierarchyManager';
import { GPUMemoryManager } from '../performance/GPUMemoryManager';
import { CPUResourceManager } from '../performance/CPUResourceManager';
import { BackgroundLoader } from '../performance/BackgroundLoader';
import { ViewportPerformanceManager } from '../performance/ViewportPerformanceManager';
import { RemoteRenderingManager } from '../performance/RemoteRenderingManager';
import { PerformanceTelemetry } from '../performance/PerformanceTelemetry';
import { BenchmarkManager } from '../performance/BenchmarkManager';
import { PerformanceProfiler } from '../performance/PerformanceProfiler';

import { ProgressiveStudyLoader } from '../streaming/ProgressiveStudyLoader';
import { ProgressiveSeriesLoader } from '../streaming/ProgressiveSeriesLoader';
import { VolumeStreamingController } from '../streaming/VolumeStreamingController';
import { AdaptiveStreamingManager } from '../streaming/AdaptiveStreamingManager';
import { StudyPrefetchPipeline } from '../streaming/StudyPrefetchPipeline';

import { AdaptiveRenderingManager } from '../rendering/AdaptiveRenderingManager';
import { ViewportOptimizer } from '../rendering/ViewportOptimizer';
import { LODManager } from '../rendering/LODManager';
import { TextureStreamingManager } from '../rendering/TextureStreamingManager';
import { MultiMonitorManager } from '../rendering/MultiMonitorManager';
import { DisplaySynchronizationManager } from '../rendering/DisplaySynchronizationManager';

import { OfflineCacheManager } from '../deployment/OfflineCacheManager';
import { CloudPACSAdapter } from '../deployment/CloudPACSAdapter';
import { RemoteSessionManager } from '../deployment/RemoteSessionManager';
import { DeploymentProfileManager } from '../deployment/DeploymentProfileManager';
import { StartupOptimizer } from '../deployment/StartupOptimizer';
import { HealthMonitor } from '../deployment/HealthMonitor';

import { ConformanceManager } from '../compliance/ConformanceManager';
import { DicomValidator } from '../compliance/DicomValidator';
import { ValidationEngine } from '../compliance/ValidationEngine';
import { IHEProfileValidator } from '../compliance/IHEProfileValidator';
import { ClinicalValidationManager } from '../compliance/ClinicalValidationManager';
import { QualityAssuranceManager } from '../compliance/QualityAssuranceManager';
import { RegressionTestManager } from '../compliance/RegressionTestManager';
import { TestDatasetManager } from '../compliance/TestDatasetManager';
import { SecurityManager } from '../compliance/SecurityManager';
import { AuthenticationAdapter } from '../compliance/AuthenticationAdapter';
import { AuthorizationManager } from '../compliance/AuthorizationManager';
import { RoleManager } from '../compliance/RoleManager';
import { AuditManager } from '../compliance/AuditManager';
import { ConfigurationManager } from '../compliance/ConfigurationManager';
import { LicenseManager } from '../compliance/LicenseManager';
import { BackupRecoveryManager } from '../compliance/BackupRecoveryManager';
import { DeploymentValidator } from '../compliance/DeploymentValidator';

import { ReleaseManager } from '../release/ReleaseManager';
import { VersionManager } from '../release/VersionManager';
import { InstallerManager } from '../release/InstallerManager';
import { UpdateManager } from '../release/UpdateManager';
import { MigrationManager } from '../release/MigrationManager';
import { DocumentationManager } from '../release/DocumentationManager';
import { SupportBundleManager } from '../release/SupportBundleManager';
import { CrashReporter } from '../release/CrashReporter';
import { TelemetryExporter } from '../release/TelemetryExporter';
import { DiagnosticManager } from '../release/DiagnosticManager';

export class EngineContext implements IEngineContext {
  public readonly eventBus: IEventBus;
  public readonly logger: IEngineLogger;
  public readonly performanceMonitor: IPerformanceMonitor;
  public readonly commandBus: ICommandBus;
  public readonly stateStore: IEngineStateStore;

  // Phase 2 Services
  public renderingEngineManager?: IRenderingEngineManager;
  public cornerstoneBootstrap?: ICornerstoneBootstrap;

  // Phase 3 DICOM Services
  public wadoClient?: IWadoClient;
  public metadataStore?: IDicomMetadataStore;
  public studyRepository?: IStudyRepository;
  public studyLoader?: StudyLoader;

  // Phase 4 Viewport Services
  public viewportRegistry?: IViewportRegistry;
  public viewportManager?: IViewportManager;

  // Phase 5 Volume Engine Services
  public volumeBuilder?: IVolumeBuilder;
  public volumeRepository?: IVolumeRepository;
  public volumeCacheManager?: IVolumeCacheManager;
  public presetManager?: IPresetManager;
  public volumeFactory?: IVolumeFactory;
  public volumeLifecycleManager?: IVolumeLifecycleManager;

  // Phase 6 Enterprise MPR Services
  public orientationManager?: IOrientationManager;
  public crosshairManager?: ICrosshairManager;
  public referenceLineManager?: IReferenceLineManager;
  public cameraSynchronizer?: ICameraSynchronizer;
  public sliceSynchronizer?: ISliceSynchronizer;
  public voiSynchronizer?: IVOISynchronizer;
  public mprViewportLayout?: IMPRViewportLayout;
  public mprWorkspaceManager?: IMPRWorkspaceManager;

  // Phase 7 Enterprise 3D Volume Rendering Services - REMOVED

  // Phase 8 Enterprise Segmentation & Clinical Services
  public segmentationManager?: ISegmentationManager;
  public segmentationRepository?: ISegmentationRepository;
  public labelMapManager?: ILabelMapManager;
  public rtStructManager?: IRTStructManager;
  public dicomSegManager?: IDicomSegManager;
  public measurementManager?: IMeasurementManager;
  public annotationManager?: IAnnotationManager;
  public clinicalSessionManager?: IClinicalSessionManager;

  // Phase 9 Advanced Clinical Visualization Services
  public registrationManager?: IRegistrationManager;
  public transformManager?: ITransformManager;
  public landmarkManager?: ILandmarkManager;
  public fusionManager?: IFusionManager;
  public cprManager?: ICPRManager;
  public vesselTrackingManager?: IVesselTrackingManager;

  // Phase 10 AI Platform Infrastructure Services
  public aiModelRegistry?: IAIModelRegistry;
  public aiModelManager?: IAIModelManager;
  public gpuResourceManager?: IGPUResourceManager;
  public modelCacheManager?: IModelCacheManager;
  public aiJobManager?: IAIJobManager;
  public aiResultRepository?: IAIResultRepository;
  public aiPlatform?: IAIPlatform;

  // Phase 10 AI Applications, Reporting & Workflow Services
  public detectionManager?: IDetectionManager;
  public segmentationInferenceManager?: SegmentationInferenceManager;
  public classificationManager?: ClassificationManager;
  public reportGenerationManager?: ReportGenerationManager;
  public heatmapManager?: HeatmapManager;
  public confidenceManager?: ConfidenceManager;
  public clinicalDecisionManager?: ClinicalDecisionManager;
  public aiOverlayManager?: AIOverlayManager;

  public structuredReportManager?: IStructuredReportManager;
  public findingManager?: FindingManager;
  public impressionManager?: ImpressionManager;
  public recommendationManager?: RecommendationManager;
  public templateManager?: TemplateManager;

  public workflowManager?: IWorkflowManager;
  public casePriorityManager?: CasePriorityManager;
  public notificationManager?: NotificationManager;
  public taskQueueManager?: TaskQueueManager;
  public studyAssignmentManager?: StudyAssignmentManager;
  public auditWorkflowManager?: AuditWorkflowManager;

  // Phase 11 Performance Infrastructure Services
  public renderingScheduler?: RenderingScheduler;
  public frameScheduler?: FrameScheduler;
  public streamingManager?: StreamingManager;
  public studyStreamingManager?: StudyStreamingManager;
  public tileStreamingManager?: TileStreamingManager;
  public prefetchManager?: PrefetchManager;
  public cacheHierarchyManager?: CacheHierarchyManager;
  public gpuMemoryManager?: GPUMemoryManager;
  public cpuResourceManager?: CPUResourceManager;
  public backgroundLoader?: BackgroundLoader;
  public viewportPerformanceManager?: ViewportPerformanceManager;
  public remoteRenderingManager?: RemoteRenderingManager;
  public performanceTelemetry?: PerformanceTelemetry;
  public benchmarkManager?: BenchmarkManager;
  public performanceProfiler?: PerformanceProfiler;

  // Phase 11 Streaming, Rendering Optimization & Enterprise Deployment Services
  public progressiveStudyLoader?: ProgressiveStudyLoader;
  public progressiveSeriesLoader?: ProgressiveSeriesLoader;
  public volumeStreamingController?: VolumeStreamingController;
  public adaptiveStreamingManager?: AdaptiveStreamingManager;
  public studyPrefetchPipeline?: StudyPrefetchPipeline;

  public adaptiveRenderingManager?: AdaptiveRenderingManager;
  public viewportOptimizer?: ViewportOptimizer;
  public lodManager?: LODManager;
  public textureStreamingManager?: TextureStreamingManager;
  public multiMonitorManager?: MultiMonitorManager;
  public displaySynchronizationManager?: DisplaySynchronizationManager;

  public offlineCacheManager?: OfflineCacheManager;
  public cloudPACSAdapter?: CloudPACSAdapter;
  public remoteSessionManager?: RemoteSessionManager;
  public deploymentProfileManager?: DeploymentProfileManager;
  public startupOptimizer?: StartupOptimizer;
  public healthMonitor?: HealthMonitor;

  // Phase 12 Compliance, Security & Validation Services
  public conformanceManager?: ConformanceManager;
  public dicomValidator?: DicomValidator;
  public validationEngine?: ValidationEngine;
  public iheProfileValidator?: IHEProfileValidator;
  public clinicalValidationManager?: ClinicalValidationManager;
  public qualityAssuranceManager?: QualityAssuranceManager;
  public regressionTestManager?: RegressionTestManager;
  public testDatasetManager?: TestDatasetManager;

  public securityManager?: SecurityManager;
  public authenticationAdapter?: AuthenticationAdapter;
  public authorizationManager?: AuthorizationManager;
  public roleManager?: RoleManager;
  public auditManager?: AuditManager;

  public configurationManager?: ConfigurationManager;
  public licenseManager?: LicenseManager;
  public backupRecoveryManager?: BackupRecoveryManager;
  public deploymentValidator?: DeploymentValidator;

  // Phase 12 Production Readiness, Clinical Validation & Enterprise Release Services
  public releaseManager?: ReleaseManager;
  public versionManager?: VersionManager;
  public installerManager?: InstallerManager;
  public updateManager?: UpdateManager;
  public migrationManager?: MigrationManager;
  public documentationManager?: DocumentationManager;
  public supportBundleManager?: SupportBundleManager;
  public crashReporter?: CrashReporter;
  public telemetryExporter?: TelemetryExporter;
  public diagnosticManager?: DiagnosticManager;

  // Future service slots
  public seriesLoader?: any;
  public instanceLoader?: any;
  public displaySetBuilder?: any;
  public imageIdBuilder?: any;
  public toolManager?: any;
  public syncManager?: any;

  constructor(debug: boolean = true) {
    this.eventBus = new EventBus();
    this.logger = new EngineLogger(debug);
    this.performanceMonitor = new PerformanceMonitor();
    this.stateStore = new EngineStateStore();
    this.commandBus = new CommandBus(() => this);

    // Phase 2 Services
    this.cornerstoneBootstrap = new CornerstoneBootstrap(this);

    // Phase 3 Services
    this.wadoClient = new WadoClient(this);
    this.metadataStore = new DicomMetadataStore(this);
    this.studyRepository = new StudyRepository(this);
    this.studyLoader = new StudyLoader(this);

    // Phase 4 Services
    this.viewportRegistry = new ViewportRegistry();
    this.viewportManager = new ViewportManager(this);

    // Phase 5 Volume Engine Services
    this.volumeBuilder = new VolumeBuilder(this);
    this.volumeRepository = new VolumeRepository(this);
    this.volumeCacheManager = new VolumeCacheManager(this, 1024);
    this.presetManager = new PresetManager();
    this.volumeFactory = new VolumeFactory(this);
    this.volumeLifecycleManager = new VolumeLifecycleManager(this);

    // Phase 6 Enterprise MPR Services
    this.orientationManager = new OrientationManager();
    this.crosshairManager = new CrosshairManager(this);
    this.referenceLineManager = new ReferenceLineManager(this);
    this.cameraSynchronizer = new CameraSynchronizer(this);
    this.sliceSynchronizer = new SliceSynchronizer(this);
    this.voiSynchronizer = new VOISynchronizer(this);
    this.mprViewportLayout = new MPRViewportLayout();
    this.mprWorkspaceManager = new MPRWorkspaceManager(this);

    // Phase 7 Enterprise 3D Volume Rendering Services - REMOVED

    // Phase 8 Enterprise Segmentation & Clinical Services
    this.segmentationRepository = new SegmentationRepository();
    this.segmentationManager = new SegmentationManager(this);
    this.labelMapManager = new LabelMapManager(this);
    this.rtStructManager = new RTStructManager(this);
    this.dicomSegManager = new DicomSegManager(this);
    this.measurementManager = new MeasurementManager(this);
    this.annotationManager = new AnnotationManager(this);
    this.clinicalSessionManager = new ClinicalSessionManager(this);

    // Phase 9 Advanced Clinical Visualization Services
    this.registrationManager = new RegistrationManager(this);
    this.transformManager = new TransformManager();
    this.landmarkManager = new LandmarkManager(this);
    this.fusionManager = new FusionManager(this);
    this.cprManager = new CPRManager(this);
    this.vesselTrackingManager = new VesselTrackingManager(this);

    // Phase 10 AI Platform Infrastructure Services
    this.aiModelRegistry = new AIModelRegistry(this);
    this.gpuResourceManager = new GPUResourceManager(this, 8192);
    this.modelCacheManager = new ModelCacheManager();
    this.aiModelManager = new AIModelManager(this);
    this.aiResultRepository = new AIResultRepository();
    this.aiJobManager = new AIJobManager(this);
    this.aiPlatform = new AIPlatform(this);

    // Phase 10 AI Applications, Reporting & Workflow Services
    this.detectionManager = new DetectionManager(this);
    this.segmentationInferenceManager = new SegmentationInferenceManager(this);
    this.classificationManager = new ClassificationManager(this);
    this.reportGenerationManager = new ReportGenerationManager(this);
    this.heatmapManager = new HeatmapManager(this);
    this.confidenceManager = new ConfidenceManager();
    this.clinicalDecisionManager = new ClinicalDecisionManager(this);
    this.aiOverlayManager = new AIOverlayManager(this);

    this.structuredReportManager = new StructuredReportManager(this);
    this.findingManager = new FindingManager();
    this.impressionManager = new ImpressionManager();
    this.recommendationManager = new RecommendationManager();
    this.templateManager = new TemplateManager();

    this.workflowManager = new WorkflowManager(this);
    this.casePriorityManager = new CasePriorityManager(this);
    this.notificationManager = new NotificationManager(this);
    this.taskQueueManager = new TaskQueueManager();
    this.studyAssignmentManager = new StudyAssignmentManager(this);
    this.auditWorkflowManager = new AuditWorkflowManager(this);

    // Phase 11 Performance Infrastructure Services
    this.renderingScheduler = new RenderingScheduler(this);
    this.frameScheduler = new FrameScheduler(this);
    this.streamingManager = new StreamingManager(this);
    this.studyStreamingManager = new StudyStreamingManager(this);
    this.tileStreamingManager = new TileStreamingManager(this);
    this.prefetchManager = new PrefetchManager(this);
    this.cacheHierarchyManager = new CacheHierarchyManager(this);
    this.gpuMemoryManager = new GPUMemoryManager(this, 4096);
    this.cpuResourceManager = new CPUResourceManager(this);
    this.backgroundLoader = new BackgroundLoader(this);
    this.viewportPerformanceManager = new ViewportPerformanceManager(this);
    this.remoteRenderingManager = new RemoteRenderingManager(this);
    this.performanceTelemetry = new PerformanceTelemetry(this);
    this.benchmarkManager = new BenchmarkManager(this);
    this.performanceProfiler = new PerformanceProfiler(this);

    // Phase 11 Streaming, Rendering Optimization & Enterprise Deployment Services
    this.progressiveStudyLoader = new ProgressiveStudyLoader(this);
    this.progressiveSeriesLoader = new ProgressiveSeriesLoader(this);
    this.volumeStreamingController = new VolumeStreamingController(this);
    this.adaptiveStreamingManager = new AdaptiveStreamingManager(this);
    this.studyPrefetchPipeline = new StudyPrefetchPipeline(this);

    this.adaptiveRenderingManager = new AdaptiveRenderingManager(this);
    this.viewportOptimizer = new ViewportOptimizer(this);
    this.lodManager = new LODManager(this);
    this.textureStreamingManager = new TextureStreamingManager(this);
    this.multiMonitorManager = new MultiMonitorManager(this);
    this.displaySynchronizationManager = new DisplaySynchronizationManager(this);

    this.offlineCacheManager = new OfflineCacheManager(this);
    this.cloudPACSAdapter = new CloudPACSAdapter(this);
    this.remoteSessionManager = new RemoteSessionManager(this);
    this.deploymentProfileManager = new DeploymentProfileManager(this);
    this.startupOptimizer = new StartupOptimizer(this);
    this.healthMonitor = new HealthMonitor(this);

    // Phase 12 Compliance, Security & Validation Services
    this.conformanceManager = new ConformanceManager(this);
    this.dicomValidator = new DicomValidator(this);
    this.validationEngine = new ValidationEngine(this);
    this.iheProfileValidator = new IHEProfileValidator(this);
    this.clinicalValidationManager = new ClinicalValidationManager(this);
    this.qualityAssuranceManager = new QualityAssuranceManager(this);
    this.regressionTestManager = new RegressionTestManager(this);
    this.testDatasetManager = new TestDatasetManager(this);

    this.securityManager = new SecurityManager(this);
    this.authenticationAdapter = new AuthenticationAdapter(this);
    this.authorizationManager = new AuthorizationManager(this);
    this.roleManager = new RoleManager(this);
    this.auditManager = new AuditManager(this);

    this.configurationManager = new ConfigurationManager(this);
    this.licenseManager = new LicenseManager(this);
    this.backupRecoveryManager = new BackupRecoveryManager(this);
    this.deploymentValidator = new DeploymentValidator(this);

    // Phase 12 Production Readiness, Clinical Validation & Enterprise Release Services
    this.releaseManager = new ReleaseManager(this);
    this.versionManager = new VersionManager(this);
    this.installerManager = new InstallerManager(this);
    this.updateManager = new UpdateManager(this);
    this.migrationManager = new MigrationManager(this);
    this.documentationManager = new DocumentationManager(this);
    this.supportBundleManager = new SupportBundleManager(this);
    this.crashReporter = new CrashReporter(this);
    this.telemetryExporter = new TelemetryExporter(this);
    this.diagnosticManager = new DiagnosticManager(this);
  }
}
