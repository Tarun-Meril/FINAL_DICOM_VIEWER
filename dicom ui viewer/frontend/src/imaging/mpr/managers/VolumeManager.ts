import { volumeLoader, setVolumesForViewports } from '@cornerstonejs/core';
import { Logger, LogCategory } from '../../shared/Logger';
import { LifecycleService, WorkstationState } from '../services/LifecycleService';
import { VolumeCache } from '../services/VolumeCache';
import { MetadataManager } from './MetadataManager';
import { VolumeRegistry } from '../../core/VolumeRegistry';

import { MPRReconstructabilityValidator } from '../MPRReconstructabilityValidator';
import { VolumeMathematicalVerifier } from '../VolumeMathematicalVerifier';

class VolumeManagerImpl {
  async createPrimaryVolume(instances: any[]): Promise<string> {
    LifecycleService.setState(WorkstationState.LOADING_VOLUME);
    
    // 1. Filter out invalid instances
    const validInstances = instances.filter(inst => {
      let ipp = inst.image_position || inst.imagePositionPatient || inst.ImagePositionPatient;
      if (typeof ipp === 'string') ipp = ipp.split('\\').map(Number);
      return Array.isArray(ipp) && ipp.length === 3;
    });

    // Isolate single coherent acquisition plane (removes orthogonal scout slices)
    const coherentInstances = MPRReconstructabilityValidator.filterCoherentOrientationGroup(validInstances);

    // Filter duplicate temporal phases
    const finalInstances = MPRReconstructabilityValidator.filterTemporalPhases(coherentInstances);

    if (finalInstances.length === 0) {
      throw new Error('No valid reconstructable instances found for MPR');
    }

    const validation = MPRReconstructabilityValidator.validate(finalInstances);
    if (validation.status === 'FAIL') {
      throw new Error(`CT MPR cannot be built: ${validation.reason}`);
    }

    // 2. Sort by ImagePositionPatient
    finalInstances.sort((a, b) => {
      let ippA = a.image_position || a.imagePositionPatient || a.ImagePositionPatient;
      if (typeof ippA === 'string') ippA = ippA.split('\\').map(Number);
      
      let ippB = b.image_position || b.imagePositionPatient || b.ImagePositionPatient;
      if (typeof ippB === 'string') ippB = ippB.split('\\').map(Number);
      
      let iop = a.image_orientation || a.imageOrientationPatient || a.ImageOrientationPatient || [1, 0, 0, 0, 1, 0];
      if (typeof iop === 'string') iop = iop.split('\\').map(Number);
      
      const normal = [
        iop[1] * iop[5] - iop[2] * iop[4],
        iop[2] * iop[3] - iop[0] * iop[5],
        iop[0] * iop[4] - iop[1] * iop[3]
      ];
      const distA = ippA[0] * normal[0] + ippA[1] * normal[1] + ippA[2] * normal[2];
      const distB = ippB[0] * normal[0] + ippB[1] * normal[1] + ippB[2] * normal[2];
      return distA - distB;
    });

    // 3. Compute actual slice spacing from IPP difference using robust average
    const calculatedSpacingMm = MPRReconstructabilityValidator.computeZSpacingMm(finalInstances);
    const computedSpacingMm = calculatedSpacingMm != null && calculatedSpacingMm >= 0.01
      ? calculatedSpacingMm
      : undefined;

    // 4. Mathematical Volume Verification (STEP 6)
    const verificationReport = VolumeMathematicalVerifier.verify(finalInstances);
    if (!verificationReport) {
      throw new Error('Mathematical volume verification failed.');
    }

    // Determine optimal array type to prevent memory bloat
    let targetDataType = 'Float32Array';
    if (verificationReport.bitsAllocated <= 16 && 
        verificationReport.pixelRepresentation === 1 && 
        verificationReport.rescaleSlope === 1 &&
        Number.isInteger(verificationReport.rescaleIntercept)) {
      targetDataType = 'Int16Array';
    } else if (verificationReport.bitsAllocated <= 16 && verificationReport.pixelRepresentation === 0 && verificationReport.rescaleSlope === 1 && Number.isInteger(verificationReport.rescaleIntercept)) {
      targetDataType = 'Uint16Array';
    }

    // 5. Register Metadata and Get Volume Image IDs
    const imageIds = MetadataManager.addInstances(finalInstances, computedSpacingMm);

    // 6. Create single streaming volume
    const volumeId = `cornerstoneStreamingImageVolume:mpr-primary-${Date.now()}`;
    Logger.info(LogCategory.GENERAL, `[VolumeManager] Creating volume: ${volumeId} with ${imageIds.length} frames (Spacing: ${computedSpacingMm || 'fallback'}, Target Type: ${targetDataType})`);

    try {
      const volume = await volumeLoader.createAndCacheVolume(volumeId, { 
        imageIds,
        targetBufferType: targetDataType === 'Int16Array' ? 'Int16Array' : targetDataType === 'Uint16Array' ? 'Uint16Array' : 'Float32Array'
      });
      VolumeCache.registerVolumeId(volumeId);
      VolumeRegistry.register({ id: volumeId, type: 'primary', cornerstoneVolume: volume });
      
      volume.load();
      Logger.info(LogCategory.GENERAL, `[VolumeManager] Volume ${volumeId} is streaming`);
      return volumeId;
    } catch (e) {
      Logger.error(LogCategory.GENERAL, `[VolumeManager] Failed to create volume`, e);
      throw e;
    }
  }

  async bindVolumeToViewports(renderingEngine: any, volumeId: string, viewportIds: string[]) {
    try {
      await setVolumesForViewports(renderingEngine, [{ volumeId }], viewportIds);
      Logger.info(LogCategory.GENERAL, `[VolumeManager] Bound volume ${volumeId} to viewports: ${viewportIds.join(', ')}`);
    } catch (e) {
      Logger.error(LogCategory.GENERAL, `[VolumeManager] Failed to bind volume to viewports`, e);
      throw e;
    }
  }

  destroy() {
    VolumeCache.purgeAll();
    VolumeRegistry.clear();
  }
}

export const VolumeManager = new VolumeManagerImpl();
