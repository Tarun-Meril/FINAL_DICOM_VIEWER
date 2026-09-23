/**
 * InstanceLoader Subsystem
 * Loads, normalizes, and indexes DICOM SOP Instances (handling multiframe proxies)
 */

import { IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';
import { Instance, IInstanceData } from '../domain/entities/DicomEntities';
import { ImageIdBuilder } from './ImageIdBuilder';

export class InstanceLoader {
  private engineContext: IEngineContext;

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public normalizeInstanceData(raw: any, baseUrl: string = ''): Instance {
    const data: IInstanceData = {
      sopInstanceUid: raw.sop_instance_uid || raw.sopInstanceUid || raw.SOPInstanceUID,
      seriesInstanceUid: raw.series_instance_uid || raw.seriesInstanceUid || raw.SeriesInstanceUID,
      studyInstanceUid: raw.study_instance_uid || raw.studyInstanceUid || raw.StudyInstanceUID,
      sopClassUid: raw.sop_class_uid || raw.sopClassUid || raw.SOPClassUID,
      instanceNumber: raw.instance_number ?? raw.instanceNumber ?? raw.InstanceNumber ?? 1,
      rows: raw.rows || raw.Rows || 512,
      columns: raw.columns || raw.Columns || 512,
      imagePositionPatient: raw.image_position || raw.imagePositionPatient || raw.ImagePositionPatient || [0, 0, 0],
      imageOrientationPatient: raw.image_orientation || raw.imageOrientationPatient || raw.ImageOrientationPatient || [1, 0, 0, 0, 1, 0],
      pixelSpacing: raw.pixel_spacing || raw.pixelSpacing || raw.PixelSpacing || [1.0, 1.0],
      sliceThickness: raw.slice_thickness || raw.sliceThickness || raw.SliceThickness || 1.25,
      bitsAllocated: raw.bits_allocated ?? raw.bitsAllocated ?? raw.BitsAllocated ?? 16,
      bitsStored: raw.bits_stored ?? raw.bitsStored ?? raw.BitsStored ?? 16,
      highBit: raw.high_bit ?? raw.highBit ?? raw.HighBit ?? 15,
      pixelRepresentation: raw.pixel_representation ?? raw.pixelRepresentation ?? raw.PixelRepresentation ?? 0,
      samplesPerPixel: raw.samples_per_pixel ?? raw.samplesPerPixel ?? raw.SamplesPerPixel ?? 1,
      photometricInterpretation: raw.photometric_interpretation || raw.photometricInterpretation || raw.PhotometricInterpretation || 'MONOCHROME2',
      windowCenter: raw.window_center ?? raw.windowCenter ?? raw.WindowCenter ?? 40,
      windowWidth: raw.window_width ?? raw.windowWidth ?? raw.WindowWidth ?? 400,
      rescaleIntercept: raw.rescale_intercept ?? raw.rescaleIntercept ?? raw.RescaleIntercept ?? 0,
      rescaleSlope: raw.rescale_slope ?? raw.rescaleSlope ?? raw.RescaleSlope ?? 1,
      numberOfFrames: raw.number_of_frames ?? raw.numberOfFrames ?? raw.NumberOfFrames ?? 1,
      frameOfReferenceUid: raw.frame_of_reference_uid || raw.frameOfReferenceUID || raw.FrameOfReferenceUID || '1.2.840.10008.1.1',
    };

    const instance = new Instance(data);
    instance.imageId = ImageIdBuilder.buildWadoUriImageId(baseUrl, instance.sopInstanceUid);
    return instance;
  }

  public async loadSeriesInstances(studyUid: string, seriesUid: string): Promise<Instance[]> {
    this.engineContext.eventBus.emit(EngineEvents.INSTANCE_LOADING, { studyInstanceUid: studyUid, seriesInstanceUid: seriesUid });
    const start = performance.now();

    try {
      const rawInstances = await this.engineContext.wadoClient!.fetchSeriesMetadata(studyUid, seriesUid);
      const baseUrl = (this.engineContext.wadoClient as any)?.options?.baseUrl || '';

      const normalizedInstances = rawInstances.map((raw) => {
        const inst = this.normalizeInstanceData(raw, baseUrl);
        this.engineContext.metadataStore!.addInstance(inst);
        return inst;
      });

      const duration = performance.now() - start;
      this.engineContext.performanceMonitor.recordInitMetric('instanceLoadTimeMs', duration);
      this.engineContext.logger.info('Loader', `Normalized & loaded ${normalizedInstances.length} instances for series ${seriesUid} in ${Math.round(duration)}ms`);
      
      this.engineContext.eventBus.emit(EngineEvents.INSTANCE_LOADED, {
        seriesInstanceUid: seriesUid,
        studyInstanceUid: studyUid,
        numberOfInstances: normalizedInstances.length,
      });

      return normalizedInstances;
    } catch (err: any) {
      this.engineContext.logger.error('Loader', `Failed loading instances for series ${seriesUid}`, err);
      this.engineContext.eventBus.emit(EngineEvents.ENGINE_ERROR, {
        module: 'InstanceLoader',
        message: err.message || 'Instance load failed',
        error: err,
        timestamp: Date.now(),
      });
      throw err;
    }
  }
}
