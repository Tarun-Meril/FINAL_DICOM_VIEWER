import { Enums, type Types } from '@cornerstonejs/core';
import { ViewportRegistry, IViewport } from '../../core/ViewportRegistry';
import { RenderingManager } from './RenderingManager';
import { RenderScheduler } from '../../rendering/RenderScheduler';
import { Logger, LogCategory } from '../../shared/Logger';

class ViewportManagerImpl {

  createOrthographic(viewportId: string, element: HTMLDivElement, orientationType: 'axial' | 'coronal' | 'sagittal'): IViewport {
    let orientation = Enums.OrientationAxis.AXIAL;
    if (orientationType === 'coronal') orientation = Enums.OrientationAxis.CORONAL;
    if (orientationType === 'sagittal') orientation = Enums.OrientationAxis.SAGITTAL;

    const viewport: IViewport = {
      id: viewportId,
      type: Enums.ViewportType.ORTHOGRAPHIC,
      element,
    };

    ViewportRegistry.register(viewport);
    RenderingManager.enableElement({
      viewportId,
      type: Enums.ViewportType.ORTHOGRAPHIC,
      element,
      defaultOptions: {
        orientation,
        background: [0, 0, 0] as any,
      }
    });

    return viewport;
  }

  createVolume3D(viewportId: string, element: HTMLDivElement): IViewport {
    const viewport: IViewport = {
      id: viewportId,
      type: Enums.ViewportType.VOLUME_3D,
      element,
    };

    ViewportRegistry.register(viewport);
    RenderingManager.enableElement({
      viewportId,
      type: Enums.ViewportType.VOLUME_3D,
      element,
      defaultOptions: { background: [0.05, 0.05, 0.07] as any }
    });

    return viewport;
  }

  resize() {
    RenderScheduler.queueResize();
  }

  resetCamera(viewportId: string) {
    const re = RenderingManager.getEngine();
    if (re) {
      const vp = re.getViewport(viewportId) as Types.IVolumeViewport;
      if (vp) {
        vp.resetCamera({ resetPan: true, resetZoom: true, resetToCenter: true });

        // Fallback for extreme aspect ratios
        if (vp.type === Enums.ViewportType.ORTHOGRAPHIC) {
          const { focalPoint, position } = vp.getCamera();
          if (focalPoint && position) {
            const depth = Math.abs(focalPoint[2] - position[2]) || 500;
            // Optionally adjust parallel scale here if needed, but Cornerstone's resetCamera handles it well.
          }
        }

        RenderScheduler.queueRenderViewport(viewportId);
      }
    }
  }

  destroy() {
    ViewportRegistry.getAll().forEach(vp => {
      RenderingManager.disableElement(vp.id);
    });
    ViewportRegistry.clear();
    Logger.info(LogCategory.GENERAL, `[ViewportManager] Destroyed all viewports`);
  }
}

export const ViewportManager = new ViewportManagerImpl();
