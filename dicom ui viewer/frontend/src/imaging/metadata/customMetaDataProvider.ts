/**
 * Metadata Provider Adapter for Cornerstone3D
 * Registers with Cornerstone's metaData registry and adapts DICOM plane & pixel modules
 */

import { metaData } from '@cornerstonejs/core';

const metadataStore = new Map<string, any>();

export function addInstanceMetadata(imageId: string, data: any): void {
  if (!imageId || !data) return;
  metadataStore.set(imageId, data);
  if (!imageId.startsWith('cornerstoneStreamingImageVolume:')) {
    metadataStore.set(`cornerstoneStreamingImageVolume:${imageId}`, data);
  } else {
    const stripped = imageId.replace(/^cornerstoneStreamingImageVolume:/, '');
    metadataStore.set(stripped, data);
  }
}

export function clearMetadataStore(): void {
  metadataStore.clear();
}

export function getMetadataFromStore(type: string, imageId: string): any {
  if (!imageId) return undefined;
  let data = metadataStore.get(imageId);
  if (!data) {
    const stripped = imageId.replace(/^cornerstoneStreamingImageVolume:/, '');
    data = metadataStore.get(stripped);
  }
  if (!data) {
    data = metadataStore.get(`cornerstoneStreamingImageVolume:${imageId}`);
  }
  if (!data) return undefined;

  if (type === 'imagePlaneModule') {
    const iop = data.imageOrientationPatient || data.image_orientation || [1, 0, 0, 0, 1, 0];
    const ipp = data.imagePositionPatient || data.image_position || [0, 0, 0];
    const ps = data.pixelSpacing || data.pixel_spacing || [1.0, 1.0];
    const st = data.sliceThickness || data.slice_thickness || 1.25;

    const rowCosines = [Number(iop[0]), Number(iop[1]), Number(iop[2])];
    const columnCosines = [Number(iop[3]), Number(iop[4]), Number(iop[5])];

    return {
      imageOrientationPatient: iop,
      imagePositionPatient: ipp,
      rowCosines,
      columnCosines,
      pixelSpacing: ps,
      columnPixelSpacing: Number(ps[0]),
      rowPixelSpacing: Number(ps[1]),
      frameOfReferenceUID: data.frameOfReferenceUID || data.frame_of_reference_uid || '1.2.840.10008.1.1',
      columns: Number(data.columns || 512),
      rows: Number(data.rows || 512),
      sliceThickness: Number(st),
    };
  }

  if (type === 'imagePixelModule') {
    return {
      pixelRepresentation: data?.pixelRepresentation ?? 0,
      bitsAllocated: data?.bitsAllocated ?? 16,
      bitsStored: data?.bitsStored ?? 16,
      highBit: data?.highBit ?? 15,
      samplesPerPixel: data?.samplesPerPixel ?? 1,
      photometricInterpretation: data?.photometricInterpretation || 'MONOCHROME2',
      rows: Number(data?.rows || 512),
      columns: Number(data?.columns || 512),
    };
  }

  if (type === 'modalityLUTModule') {
    return {
      rescaleIntercept: Number(data?.rescaleIntercept ?? data?.rescale_intercept ?? 0),
      rescaleSlope: Number(data?.rescaleSlope ?? data?.rescale_slope ?? 1),
    };
  }

  if (type === 'voiLutModule') {
    const rawWc = data.windowCenter !== undefined ? data.windowCenter : data.window_center;
    const rawWw = data.windowWidth !== undefined ? data.windowWidth : data.window_width;
    if (rawWc !== undefined && rawWw !== undefined) {
      const wc = Number(Array.isArray(rawWc) ? rawWc[0] : rawWc);
      const ww = Number(Array.isArray(rawWw) ? rawWw[0] : rawWw);
      if (!isNaN(wc) && !isNaN(ww) && ww > 0) {
        return {
          windowCenter: [wc],
          windowWidth: [ww],
        };
      }
    }
    return undefined;
  }

  if (type === 'generalSeriesModule') {
    if (!data.modality && !data.seriesInstanceUID && !data.series_instance_uid) return undefined;
    return {
      modality: data.modality || 'CT',
      seriesInstanceUID: data.seriesInstanceUID || data.series_instance_uid,
    };
  }

  if (type === 'generalStudyModule') {
    if (!data.studyInstanceUID && !data.study_instance_uid) return undefined;
    return {
      studyInstanceUID: data.studyInstanceUID || data.study_instance_uid,
    };
  }

  return undefined;
}

export function registerCustomMetaDataProvider(): void {
  metaData.addProvider(getMetadataFromStore, 10000);
}
