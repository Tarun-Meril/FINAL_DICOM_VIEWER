import { Logger, LogCategory } from '../../shared/Logger';
import { CornerstoneMetadataNormalizer } from '../CornerstoneMetadataNormalizer';
import { addInstanceMetadata } from '../../../initCornerstone';
import { API_BASE_URL } from '../../../config';

export interface IDicomMetadata {
  PatientID: string;
  StudyInstanceUID: string;
  SeriesInstanceUID: string;
  SOPInstanceUID: string;
  ImagePositionPatient: number[];
  ImageOrientationPatient: number[];
  PixelSpacing: number[];
  SliceThickness: number;
  Modality: string;
}

class MetadataManagerImpl {
  private instanceMetadata: Map<string, IDicomMetadata> = new Map();

  addInstances(instances: any[], computedSpacingMm?: number): string[] {
    const imageIds: string[] = [];

    instances.forEach((inst, idx) => {
      const sopUid = inst.sop_instance_uid || inst.sopInstanceUid || inst.SOPInstanceUID;
      if (!sopUid) return;

      const rawWado = `wadouri:${API_BASE_URL}/api/instances/${sopUid}/file`;
      const volumeImageId = `cornerstoneStreamingImageVolume:${rawWado}`;

      const meta = CornerstoneMetadataNormalizer.normalize(inst, idx, computedSpacingMm);
      
      this.instanceMetadata.set(volumeImageId, {
        PatientID: meta.patientId || '',
        StudyInstanceUID: meta.studyInstanceUid || '',
        SeriesInstanceUID: meta.seriesInstanceUid || '',
        SOPInstanceUID: sopUid,
        ImagePositionPatient: meta.imagePositionPatient || [0,0,0],
        ImageOrientationPatient: meta.imageOrientationPatient || [1,0,0,0,1,0],
        PixelSpacing: meta.pixelSpacing || [1,1],
        SliceThickness: meta.sliceThickness || 1,
        Modality: meta.modality || 'OT',
      });

      addInstanceMetadata(rawWado, meta);
      addInstanceMetadata(volumeImageId, meta);
      
      imageIds.push(rawWado);
    });

    Logger.info(LogCategory.GENERAL, `[MetadataManager] Processed metadata for ${imageIds.length} instances`);
    return imageIds;
  }

  getMetadata(imageId: string): IDicomMetadata | undefined {
    return this.instanceMetadata.get(imageId);
  }

  clear() {
    this.instanceMetadata.clear();
  }
}

export const MetadataManager = new MetadataManagerImpl();
