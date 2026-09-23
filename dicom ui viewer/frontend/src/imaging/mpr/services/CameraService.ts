import { RenderingManager } from '../managers/RenderingManager';
import { RenderScheduler } from '../../rendering/RenderScheduler';
import { type Types } from '@cornerstonejs/core';
import { Logger, LogCategory } from '../../shared/Logger';

class CameraServiceImpl {
  
  getCamera(viewportId: string): Types.ICamera | undefined {
    const re = RenderingManager.getEngine();
    if (!re) return;
    const vp = re.getViewport(viewportId);
    return vp?.getCamera();
  }

  setCamera(viewportId: string, camera: Types.ICamera) {
    const re = RenderingManager.getEngine();
    if (!re) return;
    const vp = re.getViewport(viewportId);
    if (vp) {
      vp.setCamera(camera);
      RenderScheduler.queueRenderViewport(viewportId);
    }
  }

  syncCameras(sourceViewportId: string, targetViewportIds: string[]) {
    const camera = this.getCamera(sourceViewportId);
    if (!camera) return;

    targetViewportIds.forEach(targetId => {
      this.setCamera(targetId, camera);
    });
    Logger.debug(LogCategory.RENDER, `[CameraService] Synced camera from ${sourceViewportId} to ${targetViewportIds.join(', ')}`);
  }
}

export const CameraService = new CameraServiceImpl();
