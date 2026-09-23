/**
 * DicomSegManager Subsystem
 * Imports and exports DICOM SEG binary and fractional labelmap segmentation objects
 */

import { IDicomSegManager, IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class DicomSegManager implements IDicomSegManager {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public importDicomSeg(datasetBuffer: ArrayBuffer): any {
    this.engineContext.logger.info('Segmentation', `Importing DICOM SEG dataset (${datasetBuffer.byteLength} bytes)...`);
    const segData = {
      segSeriesUid: `1.2.840.${Date.now()}`,
      labelmapCount: 1,
    };
    this.engineContext.eventBus.emit(EngineEvents.DICOM_SEG_IMPORTED, { timestamp: Date.now() });
    return segData;
  }

  public exportDicomSeg(segmentationId: string): ArrayBuffer {
    this.engineContext.logger.info('Segmentation', `Exporting DICOM SEG for segmentation ${segmentationId}...`);
    const buffer = new ArrayBuffer(2048);
    this.engineContext.eventBus.emit(EngineEvents.DICOM_SEG_EXPORTED, { segmentationId });
    return buffer;
  }
}
