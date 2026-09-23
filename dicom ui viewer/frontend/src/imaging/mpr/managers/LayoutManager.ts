import { ViewportManager } from './ViewportManager';
import { Logger, LogCategory } from '../../shared/Logger';
import { RenderScheduler } from '../../rendering/RenderScheduler';

export type ViewportConfig = {
  id: string;
  type: 'axial' | 'coronal' | 'sagittal' | 'vr';
  element: HTMLDivElement | null;
};

class LayoutManagerImpl {
  private viewportsConfig: ViewportConfig[] = [];

  public readonly AXIAL_ID = 'mpr-axial-viewport';
  public readonly CORONAL_ID = 'mpr-coronal-viewport';
  public readonly SAGITTAL_ID = 'mpr-sagittal-viewport';
  public readonly VR_ID = 'mpr-vr-viewport';

  setupLayout(elements: { axial: HTMLDivElement, coronal: HTMLDivElement, sagittal: HTMLDivElement, vr: HTMLDivElement }) {
    this.viewportsConfig = [
      { id: this.AXIAL_ID, type: 'axial', element: elements.axial },
      { id: this.CORONAL_ID, type: 'coronal', element: elements.coronal },
      { id: this.SAGITTAL_ID, type: 'sagittal', element: elements.sagittal },
      { id: this.VR_ID, type: 'vr', element: elements.vr },
    ];
  }

  mountViewports() {
    this.viewportsConfig.forEach(config => {
      if (!config.element) return;

      if (config.type === 'vr') {
        ViewportManager.createVolume3D(config.id, config.element);
      } else {
        ViewportManager.createOrthographic(config.id, config.element, config.type);
      }
    });

    RenderScheduler.queueResize();
    Logger.info(LogCategory.GENERAL, `[LayoutManager] Mounted viewports for MPR Layout`);
  }
}

export const LayoutManager = new LayoutManagerImpl();
