import { eventTarget, Enums, utilities as csUtils, type Types, cache } from '@cornerstonejs/core';
import { Logger, LogCategory } from '../../shared/Logger';
import { RenderingManager } from './RenderingManager';
import { LayoutManager } from './LayoutManager';

class OverlayManagerImpl {
  private boundCameraModified = this.onCameraModified.bind(this);
  private boundVOIModified = this.onVOIModified.bind(this);

  initialize() {
    eventTarget.addEventListener(Enums.Events.CAMERA_MODIFIED, this.boundCameraModified as any);
    eventTarget.addEventListener(Enums.Events.VOI_MODIFIED, this.boundVOIModified as any);
    Logger.info(LogCategory.GENERAL, `[OverlayManager] Initialized`);
  }

  private onCameraModified(evt: Types.EventTypes.CameraModifiedEvent) {
    const { viewportId, camera } = evt.detail;

    // Only update MPR orthogonal viewports
    if (viewportId !== LayoutManager.AXIAL_ID &&
      viewportId !== LayoutManager.CORONAL_ID &&
      viewportId !== LayoutManager.SAGITTAL_ID) {
      return;
    }

    const re = RenderingManager.getEngine();
    if (!re) return;
    const vp = re.getViewport(viewportId) as Types.IVolumeViewport;
    if (!vp) return;

    try {
      const sliceData = csUtils.getImageSliceDataForVolumeViewport(vp);
      if (sliceData) {
        const sliceIndex = sliceData.sliceIndex !== undefined ? Math.round(sliceData.sliceIndex) + 1 : '--';
        const numSlices = sliceData.numberOfSlices !== undefined ? sliceData.numberOfSlices : '--';

        const elSlice = document.getElementById(`overlay-${viewportId}-slice`);
        if (elSlice) {
          let prefix = 'Slice';
          if (viewportId === LayoutManager.AXIAL_ID) prefix = 'Slice Z:';
          if (viewportId === LayoutManager.CORONAL_ID) prefix = 'Slice Y:';
          if (viewportId === LayoutManager.SAGITTAL_ID) prefix = 'Slice X:';
          elSlice.textContent = `${prefix} ${sliceIndex} / ${numSlices}`;
        }
      }

      const zoom = vp.getZoom();
      const elZoom = document.getElementById(`overlay-${viewportId}-zoom`);
      if (elZoom) {
        elZoom.textContent = `Zoom: ${zoom.toFixed(2)}x`;
      }

      // Update Spacing
      const actors = vp.getActors();
      if (actors && actors.length > 0) {
        const volumeId = actors[0].uid;
        const volume = cache.getVolume(volumeId);
        if (volume && volume.spacing) {
          const elSpacing = document.getElementById(`overlay-${viewportId}-spacing`);
          if (elSpacing) {
            elSpacing.textContent = `Spacing: ${volume.spacing[0].toFixed(2)} x ${volume.spacing[1].toFixed(2)} x ${volume.spacing[2].toFixed(2)} mm`;
          }
        }
      }

      // Crosshair Coordinates (Focal Point)
      const { focalPoint } = vp.getCamera();
      if (focalPoint) {
        const elCoords = document.getElementById(`overlay-${viewportId}-coords`);
        if (elCoords) {
          elCoords.textContent = `X: ${focalPoint[0].toFixed(1)} Y: ${focalPoint[1].toFixed(1)} Z: ${focalPoint[2].toFixed(1)}`;
        }
      }

      // Attempt to populate WW/WL initially if it hasn't fired yet
      const voi = vp.getProperties().voiRange;
      if (voi) {
        const ww = Math.round(voi.upper - voi.lower);
        const wl = Math.round(voi.lower + ww / 2);
        const elVoi = document.getElementById(`overlay-${viewportId}-ww-wl`);
        if (elVoi) elVoi.textContent = `W: ${ww} L: ${wl}`;
      }

    } catch (e) {
      // ignore
    }
  }

  private onVOIModified(evt: Types.EventTypes.VoiModifiedEvent) {
    const { viewportId, range } = evt.detail;
    if (!range) return;

    const ww = Math.round(range.upper - range.lower);
    const wl = Math.round(range.lower + ww / 2);

    const el = document.getElementById(`overlay-${viewportId}-ww-wl`);
    if (el) {
      el.textContent = `W: ${ww} L: ${wl}`;
    }
  }

  destroy() {
    eventTarget.removeEventListener(Enums.Events.CAMERA_MODIFIED, this.boundCameraModified as any);
    eventTarget.removeEventListener(Enums.Events.VOI_MODIFIED, this.boundVOIModified as any);
  }
}

export const OverlayManager = new OverlayManagerImpl();
