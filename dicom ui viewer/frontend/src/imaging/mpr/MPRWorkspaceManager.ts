/**
 * MPRWorkspaceManager Subsystem Orchestrator
 * Manages 3D Orthographic Viewport Grid creation, crosshairs, reference lines, and camera synchronization
 */

import { IEngineContext, IMPRWorkspaceManager } from '../types/contracts';
import { EngineEvents } from '../types/events';
import { OrthographicViewportController } from '../viewport/OrthographicViewportController';

export class MPRWorkspaceManager implements IMPRWorkspaceManager {
  private engineContext: IEngineContext;
  private activeVolumeId: string | null = null;
  private viewportControllers: Map<string, OrthographicViewportController> = new Map();

  constructor(context: IEngineContext) {
    this.engineContext = context;
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
    if (!volumeId || !containers.axial || !containers.sagittal || !containers.coronal) {
      throw new Error('[MPRWorkspaceManager] Invalid parameters (axial, sagittal, coronal containers and volumeId required)');
    }

    const start = performance.now();
    this.activeVolumeId = volumeId;
    this.engineContext.logger.info('MPR', `Initializing MPR Workspace for Volume ${volumeId} (${layout} layout)...`);

    try {
      this.engineContext.mprViewportLayout!.setLayout(layout);

      // 1. Create Axial Viewport
      const axialCtrl = new OrthographicViewportController('mpr-axial', containers.axial.id || 'mpr-axial', 'AXIAL', this.engineContext);
      await this.engineContext.viewportManager!.createViewport({
        viewportId: 'mpr-axial',
        container: containers.axial,
        type: 'ORTHOGRAPHIC',
        orientation: 'AXIAL',
      });
      await axialCtrl.bindVolume(volumeId);
      this.viewportControllers.set('mpr-axial', axialCtrl);

      // 2. Create Sagittal Viewport
      const sagCtrl = new OrthographicViewportController('mpr-sagittal', containers.sagittal.id || 'mpr-sagittal', 'SAGITTAL', this.engineContext);
      await this.engineContext.viewportManager!.createViewport({
        viewportId: 'mpr-sagittal',
        container: containers.sagittal,
        type: 'ORTHOGRAPHIC',
        orientation: 'SAGITTAL',
      });
      await sagCtrl.bindVolume(volumeId);
      this.viewportControllers.set('mpr-sagittal', sagCtrl);

      // 3. Create Coronal Viewport
      const corCtrl = new OrthographicViewportController('mpr-coronal', containers.coronal.id || 'mpr-coronal', 'CORONAL', this.engineContext);
      await this.engineContext.viewportManager!.createViewport({
        viewportId: 'mpr-coronal',
        container: containers.coronal,
        type: 'ORTHOGRAPHIC',
        orientation: 'CORONAL',
      });
      await corCtrl.bindVolume(volumeId);
      this.viewportControllers.set('mpr-coronal', corCtrl);

      // 4. Initialize initial crosshair position at volume origin
      const volDesc = this.engineContext.volumeRepository?.getVolume(volumeId);
      if (volDesc) {
        this.engineContext.crosshairManager?.setWorldPosition(volDesc.origin);
      }

      const duration = performance.now() - start;
      this.engineContext.logger.info('MPR', `MPR Workspace initialized successfully in ${Math.round(duration)}ms`);

      this.engineContext.eventBus.emit(EngineEvents.MPR_WORKSPACE_CREATED, {
        layout,
        volumeId,
        viewportIds: ['mpr-axial', 'mpr-sagittal', 'mpr-coronal'],
      });
    } catch (err: any) {
      this.engineContext.logger.error('MPR', 'Failed initializing MPR Workspace', err);
      this.engineContext.eventBus.emit(EngineEvents.ENGINE_ERROR, {
        module: 'MPRWorkspaceManager',
        message: err.message || 'MPR Workspace initialization failed',
        error: err,
        timestamp: Date.now(),
      });
      throw err;
    }
  }

  public switchLayout(layout: '1x3' | '2x2' | '3+1' | 'SINGLE'): void {
    if (!this.engineContext.mprViewportLayout) return;
    this.engineContext.mprViewportLayout.setLayout(layout);
    this.engineContext.viewportManager?.resizeAll();
    this.engineContext.logger.info('MPR', `MPR Workspace layout switched to ${layout}`);
    this.engineContext.eventBus.emit(EngineEvents.MPR_LAYOUT_CHANGED, { layout });
  }

  public async destroyMPRWorkspace(): Promise<void> {
    this.engineContext.logger.info('MPR', 'Tearing down MPR Workspace...');
    try {
      for (const vpId of this.viewportControllers.keys()) {
        await this.engineContext.viewportManager?.destroyViewport(vpId);
      }
      this.viewportControllers.clear();
      this.activeVolumeId = null;
      this.engineContext.logger.info('MPR', 'MPR Workspace tear-down complete');
    } catch (err: any) {
      this.engineContext.logger.error('MPR', 'Error during MPR Workspace destroy', err);
    }
  }
}
