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
    const isColor = (
      data?.samplesPerPixel === 3 || data?.samples_per_pixel === 3 ||
      data?.photometricInterpretation === 'RGB' || data?.photometric_interpretation === 'RGB'
    );
    const bitsAllocated = Number(data?.bitsAllocated ?? data?.bits_allocated ?? (isColor ? 8 : 16));
    const bitsStored = Number(data?.bitsStored ?? data?.bits_stored ?? (isColor ? 8 : 16));
    const highBit = Number(data?.highBit ?? data?.high_bit ?? (isColor ? 7 : 15));
    const samplesPerPixel = isColor ? 3 : Number(data?.samplesPerPixel ?? data?.samples_per_pixel ?? 1);
    const photometricInterpretation = isColor ? 'RGB' : (data?.photometricInterpretation || data?.photometric_interpretation || 'MONOCHROME2');

    return {
      pixelRepresentation: data?.pixelRepresentation ?? data?.pixel_representation ?? 0,
      bitsAllocated,
      bitsStored,
      highBit,
      samplesPerPixel,
      photometricInterpretation,
      rows: Number(data?.rows || data?.Rows || 512),
      columns: Number(data?.columns || data?.Columns || 512),
    };
  }

  if (type === 'modalityLUTModule' || type === 'modalityLutModule') {
    const isColor = (
      data?.samplesPerPixel === 3 || data?.samples_per_pixel === 3 ||
      data?.photometricInterpretation === 'RGB' || data?.photometric_interpretation === 'RGB'
    );
    if (isColor) {
      return {
        rescaleIntercept: 0,
        rescaleSlope: 1,
        rescaleType: 'US',
      };
    }
    const modality = data?.modality || data?.Modality || 'CT';
    const defaultIntercept = modality === 'CT' ? -1024 : 0;
    return {
      rescaleIntercept: Number(data?.rescaleIntercept ?? data?.rescale_intercept ?? defaultIntercept),
      rescaleSlope: Number(data?.rescaleSlope ?? data?.rescale_slope ?? 1),
      rescaleType: modality === 'CT' ? 'HU' : 'US',
    };
  }

  if (type === 'voiLutModule' || type === 'voiLUTModule') {
    const isColor = (
      data?.samplesPerPixel === 3 || data?.samples_per_pixel === 3 ||
      data?.photometricInterpretation === 'RGB' || data?.photometric_interpretation === 'RGB'
    );
    if (isColor) {
      return {
        windowCenter: [128],
        windowWidth: [256],
      };
    }
    const rawWc = data.windowCenter !== undefined ? data.windowCenter : data.window_center;
    const rawWw = data.windowWidth !== undefined ? data.windowWidth : data.window_width;
    const modality = data?.modality || data?.Modality || 'CT';
    const defaultWC = modality === 'CT' ? 40 : 400;
    const defaultWW = modality === 'CT' ? 400 : 800;

    let wc = defaultWC;
    let ww = defaultWW;
    if (rawWc !== undefined) {
      const parsedWc = Number(Array.isArray(rawWc) ? rawWc[0] : rawWc);
      if (!isNaN(parsedWc)) wc = parsedWc;
    }
    if (rawWw !== undefined) {
      const parsedWw = Number(Array.isArray(rawWw) ? rawWw[0] : rawWw);
      if (!isNaN(parsedWw) && parsedWw > 0) ww = parsedWw;
    }

    return {
      windowCenter: [wc],
      windowWidth: [ww],
    };
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
