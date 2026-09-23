import { Logger, LogCategory } from '../../shared/Logger';
import { LifecycleService, WorkstationState } from '../services/LifecycleService';
import { RenderingManager } from '../managers/RenderingManager';
import { LayoutManager } from '../managers/LayoutManager';
import { ToolManager } from '../managers/ToolManager';
import { InteractionManager } from '../managers/InteractionManager';
import { SynchronizationService } from '../services/SynchronizationService';
import { StudyManager } from '../managers/StudyManager';
import { VolumeManager } from '../managers/VolumeManager';
import { type CTWindowName, MPREngine } from '../engines/MPREngine';
import { CinematicVREngine } from '../engines/CinematicVREngine';
import { GPUResourceManager } from '../managers/GPUResourceManager';
import { RenderScheduler } from '../../rendering/RenderScheduler';
import { ViewportManager } from '../managers/ViewportManager';
import { EventBus, MPREvents } from '../services/EventBus';
import { PresetManager, VRPresetName } from '../managers/PresetManager';
import { OverlayManager } from '../managers/OverlayManager';
import { ValidationService } from '../services/ValidationService';
import { eventTarget, Enums } from '@cornerstonejs/core';

class MPRControllerImpl {
  private currentSessionToken: number = 0;
  private currentInitToken: number = 0;
  private isDestroyed: boolean = false;
  private isVRAvailable: boolean = true;
  private readonly onVolumeModified = () => RenderScheduler.queueRenderAll();
  private volumeListenerAttached = false;

  async initialize(elements: { axial: HTMLDivElement, coronal: HTMLDivElement, sagittal: HTMLDivElement, vr: HTMLDivElement }) {
    this.isDestroyed = false;
    const initToken = ++this.currentInitToken;
    LifecycleService.setState(WorkstationState.INITIALIZING);
    Logger.info(LogCategory.GENERAL, `[MPRController] Initializing MPR Workstation`);

    await RenderingManager.initialize();

    if (this.isDestroyed || this.currentInitToken !== initToken) {
      Logger.info(LogCategory.GENERAL, `[MPRController] Initialization aborted, controller was destroyed or superseded`);
      return;
    }

    LayoutManager.setupLayout(elements);

    Logger.info(LogCategory.GENERAL, `[MPRController] Axial Viewport size: ${elements.axial.clientWidth}x${elements.axial.clientHeight}`);
    Logger.info(LogCategory.GENERAL, `[MPRController] Coronal Viewport size: ${elements.coronal.clientWidth}x${elements.coronal.clientHeight}`);

    LayoutManager.mountViewports();

    ToolManager.initialize();
    SynchronizationService.setupVOISynchronizer();
    SynchronizationService.setupZoomPanSynchronizer();
    SynchronizationService.setupWorldCoordinateSynchronizer();
    OverlayManager.initialize();

    LifecycleService.setState(WorkstationState.IDLE);
  }


  /**
   * Build MPR for a study. `seriesUid` is the series the host currently has
   * open; passing it keeps the reformat locked to what the user selected
   * rather than re-deriving a "best guess" series.
   */
  async loadStudy(studyUid: string, seriesUid?: string) {
    const sessionToken = ++this.currentSessionToken;
    try {
      const instances = await StudyManager.loadStudy(studyUid, seriesUid);
      if (this.currentSessionToken !== sessionToken) return;

      const volumeId = await VolumeManager.createPrimaryVolume(instances);

      LifecycleService.setState(WorkstationState.BUILDING_MPR);
      await MPREngine.build(volumeId);
      if (this.currentSessionToken !== sessionToken) return;

      LifecycleService.setState(WorkstationState.BUILDING_VR);
      try {
        await CinematicVREngine.build(volumeId);
        this.isVRAvailable = true;
        EventBus.publish(MPREvents.VR_STATUS_CHANGED, { available: true });
        Logger.info(LogCategory.GENERAL, `[MPRController] 3D Volume Rendering initialized successfully`);
      } catch (vrErr) {
        this.isVRAvailable = false;
        EventBus.publish(MPREvents.VR_STATUS_CHANGED, {
          available: false,
          error: vrErr instanceof Error ? vrErr.message : '3D GPU rendering unavailable'
        });
        Logger.warn(LogCategory.GPU, `[MPRController] 3D VR failed to initialize, continuing with 2D MPR only:`, vrErr);
      }
      if (this.currentSessionToken !== sessionToken) return;

      LifecycleService.setState(WorkstationState.READY);
      InteractionManager.bindDefaultInteractions();
      RenderScheduler.start();
      RenderScheduler.queueRenderAll();

      if (!this.volumeListenerAttached) {
        eventTarget.addEventListener(Enums.Events.IMAGE_VOLUME_MODIFIED, this.onVolumeModified);
        this.volumeListenerAttached = true;
      }
    } catch (e) {
      if (this.currentSessionToken === sessionToken) {
        Logger.error(LogCategory.GENERAL, `[MPRController] Failed to load study`, e);
        LifecycleService.setState(WorkstationState.IDLE);
        throw e;
      }
    }
  }

  getIsVRAvailable(): boolean {
    return this.isVRAvailable;
  }

  isCurrentSeriesCT(): boolean {
    return StudyManager.isCurrentSeriesCT();
  }

  applyPreset(preset: VRPresetName) {
    PresetManager.applyPreset(preset);
  }

  setVROpacity(opacity: number) {
    PresetManager.setOpacity(opacity);
  }

  setVRThreshold(threshold: number) {
    PresetManager.setThreshold(threshold);
  }

  setCTWindow(window: CTWindowName) {
    MPREngine.setCTWindow(window);
  }

  resetView() {
    ViewportManager.resetCamera(LayoutManager.AXIAL_ID);
    ViewportManager.resetCamera(LayoutManager.CORONAL_ID);
    ViewportManager.resetCamera(LayoutManager.SAGITTAL_ID);
    ViewportManager.resetCamera(LayoutManager.VR_ID);
  }

  setBlendMode(mode: 'composite' | 'maximum' | 'minimum' | 'average') {
    MPREngine.setBlendMode(mode);
  }

  setSlabThickness(thickness: number) {
    MPREngine.setSlabThickness(thickness);
  }

  /* ------------------------------------------------- display-only controls */

  private get mprViewportIds(): string[] {
    return [LayoutManager.AXIAL_ID, LayoutManager.CORONAL_ID, LayoutManager.SAGITTAL_ID];
  }

  /** Reformat interpolation. Display only — never alters pixel data. */
  setInterpolation(mode: 'linear' | 'nearest') {
    const re = RenderingManager.getEngine();
    if (!re) return;
    this.mprViewportIds.forEach((vpId) => {
      const vp = re.getViewport(vpId) as any;
      if (vp?.setProperties) {
        try {
          vp.setProperties({ interpolationType: mode === 'nearest' ? 0 : 1 });
          vp.render();
        } catch {
          /* viewport not ready yet */
        }
      }
    });
  }

  /** Show or hide the crosshair (and the reference lines it draws). */
  setCrosshairsEnabled(enabled: boolean) {
    const group = ToolManager.getMPRToolGroup();
    if (!group) return;
    try {
      if (enabled) {
        group.setToolActive('Crosshairs', {
          bindings: [{ mouseButton: 1 }],
        });
      } else {
        group.setToolDisabled('Crosshairs');
      }
    } catch (e) {
      Logger.warn(LogCategory.TOOL, `[MPRController] Could not toggle Crosshairs`, e);
    }
    RenderScheduler.queueRenderAll();
  }

  /**
   * Show or hide the reference lines without disturbing the crosshair handle.
   * Implemented by making the lines fully transparent, which keeps the tool's
   * interaction behaviour (and therefore the reference point) untouched.
   */
  setReferenceLinesEnabled(enabled: boolean) {
    const group = ToolManager.getMPRToolGroup();
    if (!group) return;
    try {
      group.setToolConfiguration('Crosshairs', {
        getReferenceLineColor: () =>
          enabled ? 'rgba(0, 255, 0, 1)' : 'rgba(0, 0, 0, 0)',
      });
    } catch (e) {
      Logger.warn(LogCategory.TOOL, `[MPRController] Could not toggle reference lines`, e);
    }
    RenderScheduler.queueRenderAll();
  }

  /** Link zoom/pan and window-level across the three reformats. */
  setLinkViews(enabled: boolean) {
    SynchronizationService.setZoomPanSyncEnabled(enabled);
  }

  setSyncWindowLevel(enabled: boolean) {
    SynchronizationService.setVOISyncEnabled(enabled);
  }

  /** Fit the volume to each reformat viewport. */
  fit() {
    this.mprViewportIds.forEach((vpId) => ViewportManager.resetCamera(vpId));
    RenderScheduler.queueRenderAll();
  }

  /** 1:1 display scale. */
  actualSize() {
    const re = RenderingManager.getEngine();
    if (!re) return;
    this.mprViewportIds.forEach((vpId) => {
      const vp = re.getViewport(vpId) as any;
      if (vp?.setZoom) {
        try {
          vp.setZoom(1);
          vp.render();
        } catch {
          /* viewport not ready yet */
        }
      }
    });
  }

  /** Remembered focal points, so "Previous Position" can return to them. */
  private previousFocalPoints: Record<string, number[]> | null = null;

  rememberPosition() {
    const re = RenderingManager.getEngine();
    if (!re) return;
    const snapshot: Record<string, number[]> = {};
    this.mprViewportIds.forEach((vpId) => {
      const vp = re.getViewport(vpId) as any;
      const cam = vp?.getCamera?.();
      if (cam?.focalPoint) snapshot[vpId] = [...cam.focalPoint];
    });
    if (Object.keys(snapshot).length > 0) this.previousFocalPoints = snapshot;
  }

  hasPreviousPosition(): boolean {
    return this.previousFocalPoints !== null;
  }

  restorePreviousPosition() {
    const re = RenderingManager.getEngine();
    if (!re || !this.previousFocalPoints) return;
    const snapshot = this.previousFocalPoints;
    Object.entries(snapshot).forEach(([vpId, focalPoint]) => {
      const vp = re.getViewport(vpId) as any;
      const cam = vp?.getCamera?.();
      if (!cam?.focalPoint || !cam?.position) return;
      const d = [
        focalPoint[0] - cam.focalPoint[0],
        focalPoint[1] - cam.focalPoint[1],
        focalPoint[2] - cam.focalPoint[2],
      ];
      vp.setCamera({
        focalPoint,
        position: [cam.position[0] + d[0], cam.position[1] + d[1], cam.position[2] + d[2]],
      });
      vp.render();
    });
  }

  destroy() {
    this.isDestroyed = true;
    this.currentInitToken++;
    this.currentSessionToken++; // Abort any pending loadStudy operations
    LifecycleService.setState(WorkstationState.DISPOSING);
    Logger.info(LogCategory.GENERAL, `[MPRController] Destroying MPR Workstation`);

    RenderScheduler.stop();
    if (this.volumeListenerAttached) {
      eventTarget.removeEventListener(Enums.Events.IMAGE_VOLUME_MODIFIED, this.onVolumeModified);
      this.volumeListenerAttached = false;
    }
    // 1. Study Close
    StudyManager.closeStudy();

    // 2. Release Viewports and Actors
    ViewportManager.destroy();

    // 3. Release Volume References
    VolumeManager.destroy();

    // 4. Destroy ToolGroups
    ToolManager.destroy();
    SynchronizationService.destroy();
    OverlayManager.destroy();

    // 5. Destroy Rendering Engine Resources
    RenderingManager.destroy();
    GPUResourceManager.releaseResources();

    // 6. Controller is now destroyed
    LifecycleService.setState(WorkstationState.DESTROYED);
  }
}

export const MPRController = new MPRControllerImpl();
(window as any).MPRController = MPRController;
(window as any).RenderingManager = RenderingManager;
(window as any).VolumeManager = VolumeManager;
