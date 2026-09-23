import { Logger, LogCategory } from '../../shared/Logger';
import { RenderingManager } from '../managers/RenderingManager';
import { LayoutManager } from '../managers/LayoutManager';
import { cache, type Types, Enums } from '@cornerstonejs/core';
import { MetadataManager } from '../managers/MetadataManager';

class ValidationServiceImpl {
  runValidationChecks() {
    Logger.info(LogCategory.GENERAL, `[Validation] Starting Developer Validation Mode...`);
    
    const re = RenderingManager.getEngine();
    if (!re) {
      Logger.error(LogCategory.GENERAL, `[Validation] FAIL: Rendering engine not initialized.`);
      return;
    }

    // 1. Verify Viewports and Actors
    const viewports = [LayoutManager.AXIAL_ID, LayoutManager.CORONAL_ID, LayoutManager.SAGITTAL_ID, LayoutManager.VR_ID];
    viewports.forEach(vpId => {
      const vp = re.getViewport(vpId) as Types.IVolumeViewport;
      if (!vp) {
        Logger.error(LogCategory.GENERAL, `[Validation] FAIL: Viewport ${vpId} not found.`);
        return;
      }
      const actors = vp.getActors();
      if (!actors || actors.length !== 1) {
        Logger.warn(LogCategory.GENERAL, `[Validation] WARN: Viewport ${vpId} has ${actors?.length || 0} actors (expected 1).`);
      } else {
        Logger.info(LogCategory.GENERAL, `[Validation] PASS: Viewport ${vpId} actor initialized.`);
      }
    });

    // 2. Verify Volumes and Orientation
    const cachedVolumes = cache.getVolumes();
    if (cachedVolumes.length !== 1) {
      Logger.warn(LogCategory.GENERAL, `[Validation] WARN: Multiple volumes cached (${cachedVolumes.length}). Expected 1 streaming volume.`);
    }

    if (cachedVolumes.length > 0) {
      const volume = cachedVolumes[0];
      const spacing = volume.spacing;
      const meta = MetadataManager.getMetadata(volume.imageIds[0]);
      if (meta) {
        if (Math.abs(spacing[0] - meta.PixelSpacing[0]) > 0.01 || Math.abs(spacing[1] - meta.PixelSpacing[1]) > 0.01) {
          Logger.warn(LogCategory.GENERAL, `[Validation] WARN: Voxel spacing mismatch. Volume: ${spacing}, DICOM: ${meta.PixelSpacing}`);
        } else {
          Logger.info(LogCategory.GENERAL, `[Validation] PASS: Voxel spacing matches DICOM.`);
        }
      }
    }

    Logger.info(LogCategory.GENERAL, `[Validation] Developer Validation Checks Completed.`);
  }
}

export const ValidationService = new ValidationServiceImpl();
