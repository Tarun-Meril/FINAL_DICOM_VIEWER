import { Logger, LogCategory } from '../../shared/Logger';
import { VolumeManager } from '../managers/VolumeManager';
import { RenderingManager } from '../managers/RenderingManager';
import { LayoutManager } from '../managers/LayoutManager';
import { ViewportManager } from '../managers/ViewportManager';
import { Enums, cache } from '@cornerstonejs/core';

export type CTWindowName = 'soft' | 'lung' | 'bone' | 'brain';

const CT_WINDOWS: Record<CTWindowName, { lower: number; upper: number }> = {
  soft: { lower: -160, upper: 240 },
  lung: { lower: -1350, upper: 150 },
  bone: { lower: -500, upper: 1500 },
  brain: { lower: 0, upper: 80 },
};


class MPREngineImpl {
  async build(volumeId: string) {
    Logger.info(LogCategory.GENERAL, `[MPREngine] Building MPR planes from volume ${volumeId}`);
    const re = RenderingManager.getEngine();
    if (!re) throw new Error('Rendering engine not initialized');

    const viewportIds = [
      LayoutManager.AXIAL_ID,
      LayoutManager.CORONAL_ID,
      LayoutManager.SAGITTAL_ID
    ];

    await VolumeManager.bindVolumeToViewports(re, volumeId, viewportIds);

    // Fix Fake MPR: Use actual physical volume direction for orientation
    const volume = cache.getVolume(volumeId);
    if (volume && volume.direction) {
      const dir = volume.direction;
      const rowCos = [dir[0], dir[1], dir[2]];
      const colCos = [dir[3], dir[4], dir[5]];
      const normal = [dir[6], dir[7], dir[8]];

      // Axial: looking down the slice normal, up is -column (anterior)
      const axialOrientation = {
        viewPlaneNormal: normal,
        viewUp: [-colCos[0], -colCos[1], -colCos[2]]
      };

      // Coronal: looking down the Y-axis (column), up is +normal (superior)
      const coronalOrientation = {
        viewPlaneNormal: colCos,
        viewUp: normal
      };

      // Sagittal: looking down the X-axis (row), up is +normal (superior)
      const sagittalOrientation = {
        viewPlaneNormal: rowCos,
        viewUp: normal
      };

      const axialVp = re.getViewport(LayoutManager.AXIAL_ID) as any;
      if (axialVp?.setOrientation) axialVp.setOrientation(axialOrientation);

      const coronalVp = re.getViewport(LayoutManager.CORONAL_ID) as any;
      if (coronalVp?.setOrientation) coronalVp.setOrientation(coronalOrientation);

      const sagittalVp = re.getViewport(LayoutManager.SAGITTAL_ID) as any;
      if (sagittalVp?.setOrientation) sagittalVp.setOrientation(sagittalOrientation);
    }

    // Initial camera reset for MPR viewports
    viewportIds.forEach(vpId => {
      const vp = re.getViewport(vpId) as any;
      if (vp?.setProperties && vp.type === Enums.ViewportType.ORTHOGRAPHIC) {
        vp.setProperties({ voiRange: CT_WINDOWS.soft });
      }
      ViewportManager.resetCamera(vpId);
    });
  }

  setCTWindow(window: CTWindowName) {
    this.applyCTPreset(window);
  }

  applyCTPreset(preset: CTWindowName) {
    const re = RenderingManager.getEngine();
    if (!re) return;

    const range = CT_WINDOWS[preset];
    if (!range) return;

    Logger.info(LogCategory.GENERAL, `[MPREngine] Applying CT VOI preset: ${preset} [${range.lower}, ${range.upper}]`);

    [LayoutManager.AXIAL_ID, LayoutManager.CORONAL_ID, LayoutManager.SAGITTAL_ID].forEach(viewportId => {
      const viewport = re.getViewport(viewportId) as any;
      if (viewport?.setProperties && viewport.type === Enums.ViewportType.ORTHOGRAPHIC) {
        viewport.setProperties({ voiRange: range });
        viewport.render();
      }
    });
  }

  getCTPresetRange(preset: CTWindowName): { lower: number; upper: number } | undefined {
    return CT_WINDOWS[preset];
  }

  setBlendMode(mode: 'composite' | 'maximum' | 'minimum' | 'average') {
    const re = RenderingManager.getEngine();
    if (!re) return;

    let csBlendMode = Enums.BlendModes.COMPOSITE;
    switch (mode) {
      case 'maximum':
        csBlendMode = Enums.BlendModes.MAXIMUM_INTENSITY_BLEND;
        break;
      case 'minimum':
        csBlendMode = Enums.BlendModes.MINIMUM_INTENSITY_BLEND;
        break;
      case 'average':
        csBlendMode = Enums.BlendModes.AVERAGE_INTENSITY_BLEND;
        break;
      case 'composite':
      default:
        csBlendMode = Enums.BlendModes.COMPOSITE;
        break;
    }

    Logger.info(LogCategory.GENERAL, `[MPREngine] Setting blend mode to ${mode}`);

    [LayoutManager.AXIAL_ID, LayoutManager.CORONAL_ID, LayoutManager.SAGITTAL_ID].forEach(viewportId => {
      const viewport = re.getViewport(viewportId) as any;
      if (viewport?.setBlendMode) {
        viewport.setBlendMode(csBlendMode);
        viewport.render();
      }
    });
  }

  setSlabThickness(thickness: number) {
    const re = RenderingManager.getEngine();
    if (!re) return;

    Logger.info(LogCategory.GENERAL, `[MPREngine] Setting slab thickness to ${thickness}mm`);

    [LayoutManager.AXIAL_ID, LayoutManager.CORONAL_ID, LayoutManager.SAGITTAL_ID].forEach(viewportId => {
      const viewport = re.getViewport(viewportId) as any;
      if (viewport?.setSlabThickness) {
        viewport.setSlabThickness(thickness);
        viewport.render();
      }
    });
  }
}

export const MPREngine = new MPREngineImpl();
