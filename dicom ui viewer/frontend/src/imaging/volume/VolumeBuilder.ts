/**
 * VolumeBuilder Subsystem
 * Transforms Stack DisplaySets into Streaming Image Volume descriptors
 */

import { IEngineContext, IVolumeBuilder, IVolumeDescriptor } from '../types/contracts';
import { EngineEvents } from '../types/events';
import { DisplaySet } from '../domain/entities/DicomEntities';

export class VolumeBuilder implements IVolumeBuilder {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public buildVolumeDescriptor(displaySet: DisplaySet): IVolumeDescriptor {
    if (!displaySet || !displaySet.instances || displaySet.instances.length === 0) {
      throw new Error('[VolumeBuilder] Cannot build volume from empty or invalid DisplaySet');
    }

    const start = performance.now();
    const volumeId = `cornerstoneStreamingImageVolume:volume-${displaySet.seriesInstanceUid}`;
    this.engineContext.logger.info('Volume', `Building Volume Descriptor for ${volumeId}`);

    this.engineContext.eventBus.emit(EngineEvents.VOLUME_BUILDING, {
      volumeId,
      displaySetInstanceUid: displaySet.displaySetInstanceUID,
    });

    const firstInst = displaySet.instances[0];
    const lastInst = displaySet.instances[displaySet.instances.length - 1];

    const columns = firstInst.columns || 512;
    const rows = firstInst.rows || 512;
    const numSlices = displaySet.instances.length;
    const dimensions: [number, number, number] = [columns, rows, numSlices];

    const spacingX = firstInst.pixelSpacing.columnSpacing || 1.0;
    const spacingY = firstInst.pixelSpacing.rowSpacing || 1.0;

    // Calculate actual slice spacing from physical positions
    let spacingZ = firstInst.sliceThickness || 1.25;
    if (numSlices > 1) {
      const dist = Math.abs(lastInst.getSpatialProjectionDistance() - firstInst.getSpatialProjectionDistance());
      spacingZ = dist / (numSlices - 1) || spacingZ;
    }
    const spacing: [number, number, number] = [spacingX, spacingY, spacingZ];

    const origin = firstInst.imagePositionPatient;
    const direction = firstInst.orientation.toArray();

    const voxelCount = columns * rows * numSlices;
    const bytesPerVoxel = (firstInst.bitsAllocated || 16) / 8;
    const sizeBytes = voxelCount * bytesPerVoxel;
    const sizeMB = Math.round((sizeBytes / (1024 * 1024)) * 100) / 100;

    const descriptor: IVolumeDescriptor = {
      volumeId,
      seriesInstanceUid: displaySet.seriesInstanceUid,
      studyInstanceUid: displaySet.studyInstanceUid,
      imageIds: displaySet.imageIds,
      dimensions,
      spacing,
      origin,
      direction,
      numSlices,
      sizeMB,
      voxelCount,
      type: 'STREAMING',
    };

    const duration = performance.now() - start;
    this.engineContext.performanceMonitor.recordInitMetric('volumeBuildTimeMs', duration);
    this.engineContext.performanceMonitor.recordInitMetric('volumeSizeBytes', sizeBytes);
    this.engineContext.performanceMonitor.recordInitMetric('voxelCount', voxelCount);

    this.engineContext.logger.info('Volume', `Built Volume Descriptor ${volumeId} (${columns}x${rows}x${numSlices}, ${sizeMB}MB) in ${Math.round(duration)}ms`);
    
    this.engineContext.eventBus.emit(EngineEvents.VOLUME_CREATED, {
      volumeId,
      dimensions,
      spacing,
      sizeMB,
      voxelCount,
    });

    return descriptor;
  }
}
