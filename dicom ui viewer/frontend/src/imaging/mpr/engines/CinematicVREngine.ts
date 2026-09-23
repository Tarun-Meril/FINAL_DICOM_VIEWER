import { Logger, LogCategory } from '../../shared/Logger';
import { VolumeManager } from '../managers/VolumeManager';
import { RenderingManager } from '../managers/RenderingManager';
import { LayoutManager } from '../managers/LayoutManager';
import { ViewportManager } from '../managers/ViewportManager';
import { cache } from '@cornerstonejs/core';
import { PresetManager } from '../managers/PresetManager';

class CinematicVREngineImpl {
  async build(volumeId: string) {
    Logger.info(LogCategory.GENERAL, `[CinematicVREngine] Building cinematic VR from volume ${volumeId}`);
    const re = RenderingManager.getEngine();
    if (!re) throw new Error('Rendering engine not initialized');

    // Bind the 3D volume to the VR Viewport
    await VolumeManager.bindVolumeToViewports(re, volumeId, [LayoutManager.VR_ID]);

    const vp = re.getViewport(LayoutManager.VR_ID) as any;
    if (vp) {
      this.configureCinematicRendering(vp, volumeId);
    }

    ViewportManager.resetCamera(LayoutManager.VR_ID);

    // Default to Bone preset on load
    PresetManager.applyPreset('bone');
  }

  private configureCinematicRendering(vp: any, volumeId: string) {
    try {
      const volume = cache.getVolume(volumeId);
      if (!volume) return;

      const actors = vp.getActors();
      if (!actors || actors.length === 0) return;

      const actor = actors[0].actor;
      const mapper = actor.getMapper();
      const property = actor.getProperty();

      // 1. Force High-Quality Sampling Distance
      // The lower the sample distance, the less aliasing (stair-stepping) artifacts.
      // Default VTK sample distance is often 1.0 or spacing based, which is too coarse for cinematic quality.
      const spacing = volume.spacing || [1, 1, 1];
      const minSpacing = Math.min(spacing[0], spacing[1], spacing[2]);

      // For real cinematic look, we sample at half the minimum voxel spacing.
      mapper.setSampleDistance(minSpacing * 0.5);

      // 2. VTK Direct Volume Rendering (Shade disabled for WebGL stability)
      property.setShade(false);
      property.setInterpolationTypeToLinear();

      // 3. Set Base Cinematic Lighting Parameters
      // These will be fine-tuned by the PresetManager per-preset, but we set a good baseline here.
      property.setAmbient(0.15);
      property.setDiffuse(0.85);
      property.setSpecular(0.25);
      property.setSpecularPower(15.0);

      // Enable gradient opacity to make boundaries sharper (creates pseudo-ambient occlusion effect)
      // NOTE: Temporarily disabled because it causes vtk.js shader compilation crash (isAttributeUsed error) on some GPUs.
      property.setUseGradientOpacity(0, false);
      // property.setGradientOpacityMinimumValue(0, 5);
      // property.setGradientOpacityMinimumOpacity(0, 0.0);
      // property.setGradientOpacityMaximumValue(0, 50);
      // property.setGradientOpacityMaximumOpacity(0, 1.0);

      Logger.info(LogCategory.RENDER, '[CinematicVREngine] Successfully injected cinematic VTK properties');
    } catch (e) {
      Logger.error(LogCategory.RENDER, '[CinematicVREngine] Failed to configure cinematic rendering', e);
    }
  }
}

export const CinematicVREngine = new CinematicVREngineImpl();
