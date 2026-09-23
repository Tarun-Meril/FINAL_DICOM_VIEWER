import { synchronizers, SynchronizerManager } from '@cornerstonejs/tools';
import { Enums, eventTarget } from '@cornerstonejs/core';
import { Logger, LogCategory } from '../../shared/Logger';
import { LayoutManager } from '../managers/LayoutManager';
import { RenderingManager } from '../managers/RenderingManager';
class SynchronizationServiceImpl {
  private readonly VOI_SYNC_ID = 'mpr-voi-synchronizer';
  private readonly ZOOM_PAN_SYNC_ID = 'mpr-zoom-pan-synchronizer';
  private isSyncingCamera = false;
  
  setupVOISynchronizer() {
    let voiSynchronizer = SynchronizerManager.getSynchronizer(this.VOI_SYNC_ID);
    if (!voiSynchronizer) {
      try {
        voiSynchronizer = synchronizers.createVOISynchronizer(this.VOI_SYNC_ID);
        const re = RenderingManager.getEngine();
        if (voiSynchronizer && re) {
          [LayoutManager.AXIAL_ID, LayoutManager.CORONAL_ID, LayoutManager.SAGITTAL_ID].forEach(vpId => {
            voiSynchronizer.add({ renderingEngineId: re.id, viewportId: vpId });
          });
          Logger.info(LogCategory.GENERAL, `[SynchronizationService] Setup VOI synchronizer for Axial, Coronal, Sagittal`);
        }
      } catch (e) {
        Logger.error(LogCategory.GENERAL, `[SynchronizationService] Failed to setup VOI synchronizer`, e);
      }
    }
  }

  setupZoomPanSynchronizer() {
    let zoomPanSynchronizer = SynchronizerManager.getSynchronizer(this.ZOOM_PAN_SYNC_ID);
    if (!zoomPanSynchronizer) {
      try {
        zoomPanSynchronizer = synchronizers.createZoomPanSynchronizer(this.ZOOM_PAN_SYNC_ID);
        const re = RenderingManager.getEngine();
        if (zoomPanSynchronizer && re) {
          [LayoutManager.AXIAL_ID, LayoutManager.CORONAL_ID, LayoutManager.SAGITTAL_ID].forEach(vpId => {
            zoomPanSynchronizer.add({ renderingEngineId: re.id, viewportId: vpId });
          });
          Logger.info(LogCategory.GENERAL, `[SynchronizationService] Setup ZoomPan synchronizer`);
        }
      } catch (e) {
        Logger.error(LogCategory.GENERAL, `[SynchronizationService] Failed to setup ZoomPan synchronizer`, e);
      }
    }
  }

  setupWorldCoordinateSynchronizer() {
    // 1. Remove old listener if any
    eventTarget.removeEventListener(Enums.Events.CAMERA_MODIFIED, this.onCameraModified);
    // 2. Add new listener
    eventTarget.addEventListener(Enums.Events.CAMERA_MODIFIED, this.onCameraModified);
    Logger.info(LogCategory.GENERAL, `[SynchronizationService] Setup WorldCoordinateSyncManager`);
  }

  private onCameraModified = (evt: any) => {
    if (this.isSyncingCamera) return;

    const { viewportId, camera } = evt.detail;
    const mprIds = [LayoutManager.AXIAL_ID, LayoutManager.CORONAL_ID, LayoutManager.SAGITTAL_ID];
    
    // If the event came from an MPR viewport, sync the 3D VR focal point to it!
    if (mprIds.includes(viewportId) && camera.focalPoint) {
      this.syncVRFocalPointFromWorld(camera.focalPoint);
    }
  };

  private syncVRFocalPointFromWorld(worldPos: [number, number, number]) {
    const re = RenderingManager.getEngine();
    if (!re) return;

    const vrVp = re.getViewport(LayoutManager.VR_ID) as any;
    if (!vrVp || typeof vrVp.getCamera !== 'function' || typeof vrVp.setCamera !== 'function') return;

    this.isSyncingCamera = true;
    try {
      const camera = vrVp.getCamera();
      if (camera.focalPoint && camera.position) {
        const deltaX = worldPos[0] - camera.focalPoint[0];
        const deltaY = worldPos[1] - camera.focalPoint[1];
        const deltaZ = worldPos[2] - camera.focalPoint[2];

        vrVp.setCamera({
          focalPoint: [worldPos[0], worldPos[1], worldPos[2]],
          position: [
            camera.position[0] + deltaX,
            camera.position[1] + deltaY,
            camera.position[2] + deltaZ,
          ],
        });
        vrVp.render();
      }
    } finally {
      this.isSyncingCamera = false;
    }
  }

  /**
   * Synchronizes camera focal point across all MPR viewports to a common patient/world-space coordinate.
   * Keeps Axial, Coronal, and Sagittal orthogonal views aligned to the identical physical point.
   */
  syncMPRPositionFromWorld(worldPos: [number, number, number], sourceViewportId?: string) {
    const re = RenderingManager.getEngine();
    if (!re) return;

    const mprViewportIds = [LayoutManager.AXIAL_ID, LayoutManager.CORONAL_ID, LayoutManager.SAGITTAL_ID];

    mprViewportIds.forEach(vpId => {
      if (vpId === sourceViewportId) return;

      const vp = re.getViewport(vpId) as any;
      if (!vp || typeof vp.getCamera !== 'function' || typeof vp.setCamera !== 'function') return;

      const camera = vp.getCamera();
      if (!camera.focalPoint || !camera.position) return;

      // Compute delta between current focal point and target world position
      const deltaX = worldPos[0] - camera.focalPoint[0];
      const deltaY = worldPos[1] - camera.focalPoint[1];
      const deltaZ = worldPos[2] - camera.focalPoint[2];

      vp.setCamera({
        focalPoint: [worldPos[0], worldPos[1], worldPos[2]],
        position: [
          camera.position[0] + deltaX,
          camera.position[1] + deltaY,
          camera.position[2] + deltaZ,
        ],
      });
      vp.render();
    });
  }

  /**
   * Enable/disable window-level propagation across the three reformats.
   * Backs the "Sync W/L" toggle in the MPR toolbar.
   */
  setVOISyncEnabled(enabled: boolean) {
    const sync = SynchronizerManager.getSynchronizer(this.VOI_SYNC_ID) as any;
    if (sync) {
      sync.setEnabled ? sync.setEnabled(enabled) : (sync.enabled = enabled);
      Logger.info(LogCategory.GENERAL, `[SynchronizationService] VOI sync ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Enable/disable linked zoom & pan across the three reformats.
   * Backs the "Link Views" toggle in the MPR toolbar.
   */
  setZoomPanSyncEnabled(enabled: boolean) {
    const sync = SynchronizerManager.getSynchronizer(this.ZOOM_PAN_SYNC_ID) as any;
    if (sync) {
      sync.setEnabled ? sync.setEnabled(enabled) : (sync.enabled = enabled);
      Logger.info(LogCategory.GENERAL, `[SynchronizationService] ZoomPan sync ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  destroy() {
    eventTarget.removeEventListener(Enums.Events.CAMERA_MODIFIED, this.onCameraModified);
    SynchronizerManager.destroySynchronizer(this.VOI_SYNC_ID);
    SynchronizerManager.destroySynchronizer(this.ZOOM_PAN_SYNC_ID);
    Logger.info(LogCategory.GENERAL, `[SynchronizationService] Destroyed synchronizers`);
  }
}

export const SynchronizationService = new SynchronizationServiceImpl();
