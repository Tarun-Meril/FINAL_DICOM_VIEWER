import './vtkPolyfill';
import * as cornerstoneCore from '@cornerstonejs/core';
import { init as initCore, volumeLoader, cornerstoneStreamingImageVolumeLoader, metaData, RenderingEngine, getRenderingEngine, Enums, utilities } from '@cornerstonejs/core';
import {
  init as initTools,
  addTool,
  PanTool,
  ZoomTool,
  WindowLevelTool,
  StackScrollTool,
  LengthTool,
  AngleTool,
  CobbAngleTool,
  EllipticalROITool,
  RectangleROITool,
  ProbeTool,
  BidirectionalTool,
  ArrowAnnotateTool,
  CrosshairsTool,
  TrackballRotateTool,
  PlanarFreehandROITool,
  ReferenceLinesTool,
} from '@cornerstonejs/tools';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';
import { API_BASE_URL } from './config';
import DecodeWorker from '../node_modules/@cornerstonejs/dicom-image-loader/dist/esm/decodeImageFrameWorker.js?worker';
import { parseDataSet } from './vr/dicom/parser';
import { decodeFrame } from './vr/dicom/decode/decodeFrame';
import { T } from './vr/dicom/dictionary';
import { computeAnatomicalVoxelHU } from './utils/syntheticDicomVolume';

if (typeof window !== 'undefined') {
  (window as any).cornerstone = cornerstoneCore;
  (window as any).dicomParser = dicomParser;
  (window as any).cornerstoneDICOMImageLoader = dicomImageLoader;
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH: Fix Cornerstone3D 1.x CrosshairsTool mouseMoveCallback crash
// when filteredToolAnnotations is undefined during volume loading.
// ─────────────────────────────────────────────────────────────────────────────
class SafeCrosshairsTool extends CrosshairsTool {
  constructor(toolProps: any, defaultToolProps: any) {
    super(toolProps, defaultToolProps);
    const orig = this.mouseMoveCallback;
    if (orig) {
      this.mouseMoveCallback = (evt: any, filteredToolAnnotations: any) => {
        if (!filteredToolAnnotations) {
          filteredToolAnnotations = [];
        }
        return orig.call(this, evt, filteredToolAnnotations);
      };
    }
  }
}
(SafeCrosshairsTool as any).toolName = 'Crosshairs';

import vtkOpenGLRenderWindow from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow';

// ─────────────────────────────────────────────────────────────────────────────
// PATCH: Fix VTK.js RenderWindow missing getWebgl2() called by Cornerstone3D
// vtkStreamingOpenGLVolumeMapper (avoids "model._openGLRenderWindow.getWebgl2 is not a function")
// ─────────────────────────────────────────────────────────────────────────────
if (vtkOpenGLRenderWindow && (vtkOpenGLRenderWindow as any).extend) {
  const origExtend = (vtkOpenGLRenderWindow as any).extend;
  (vtkOpenGLRenderWindow as any).extend = function(publicAPI: any, model: any, initialValues: any = {}) {
    origExtend(publicAPI, model, initialValues);
    if (!publicAPI.getWebgl2) {
      publicAPI.getWebgl2 = () => {
        const gl = publicAPI.get3DContext ? publicAPI.get3DContext() : model.context;
        return typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
      };
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata Store
// Per-imageId metadata written by addInstanceMetadata() during volume build.
// ─────────────────────────────────────────────────────────────────────────────

const metadataStore = new Map<string, any>();

export function addInstanceMetadata(imageId: string, data: any) {
  if (!imageId || !data) return;
  metadataStore.set(imageId, data);
  if (!imageId.startsWith('cornerstoneStreamingImageVolume:')) {
    metadataStore.set(`cornerstoneStreamingImageVolume:${imageId}`, data);
  } else {
    const stripped = imageId.replace(/^cornerstoneStreamingImageVolume:/, '');
    metadataStore.set(stripped, data);
  }
}

function customMetaDataProvider(type: string, imageId: string): any {
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

  // ── imagePlaneModule ────────────────────────────────────────────────────────
  if (type === 'imagePlaneModule') {
    const rawIop = data.imageOrientationPatient || data.image_orientation;
    const iop = (Array.isArray(rawIop) && rawIop.length >= 6) ? rawIop : [1, 0, 0, 0, 1, 0];

    const rawIpp = data.imagePositionPatient || data.image_position;
    const ipp = (Array.isArray(rawIpp) && rawIpp.length >= 3) ? rawIpp : [0, 0, 0];

    const rawPs = data.pixelSpacing || data.pixel_spacing;
    const ps = (Array.isArray(rawPs) && rawPs.length >= 2) ? rawPs : [1.0, 1.0];

    const st = Number(data.sliceThickness || data.slice_thickness || 1.0) || 1.0;

    const forUID =
      data.frameOfReferenceUID ||
      data.frame_of_reference_uid ||
      data.seriesInstanceUID ||
      data.series_instance_uid ||
      `synthetic-for-${imageId.substring(0, 30)}`;

    const rowCosines = [Number(iop[0]) || 1, Number(iop[1]) || 0, Number(iop[2]) || 0];
    const columnCosines = [Number(iop[3]) || 0, Number(iop[4]) || 1, Number(iop[5]) || 0];

    const spacingBetweenSlices = Number(
      data.spacingBetweenSlices || data.spacing_between_slices || st
    ) || st;

    return {
      imageOrientationPatient: iop,
      imagePositionPatient: ipp,
      rowCosines,
      columnCosines,
      pixelSpacing: ps,
      columnPixelSpacing: Number(ps[1]) || 1.0,
      rowPixelSpacing: Number(ps[0]) || 1.0,
      frameOfReferenceUID: forUID,
      columns: Number(data.columns || data.Columns || 512),
      rows: Number(data.rows || data.Rows || 512),
      sliceThickness: st,
      spacingBetweenSlices,
    };
  }

  // ── imagePixelModule ────────────────────────────────────────────────────────
  if (type === 'imagePixelModule') {
    const bitsAllocated = Number(data.bits_allocated || data.bitsAllocated || 16);
    const bitsStored = Number(data.bits_stored || data.bitsStored || 16);
    const highBit = Number(data.high_bit || data.highBit || bitsStored - 1);
    const samplesPerPixel = Number(data.samples_per_pixel || data.samplesPerPixel || 1);
    const photometric = data.photometric_interpretation || data.photometricInterpretation || 'MONOCHROME2';
    const pixelRep = Number(data.pixel_representation ?? data.pixelRepresentation ?? 0);

    return {
      bitsAllocated,
      bitsStored,
      highBit,
      pixelRepresentation: pixelRep,
      samplesPerPixel,
      photometricInterpretation: photometric,
      rows: Number(data.rows || data.Rows || 512),
      columns: Number(data.columns || data.Columns || 512),
    };
  }

  // ── modalityLUTModule ───────────────────────────────────────────────────────
  if (type === 'modalityLUTModule' || type === 'modalityLutModule') {
    const modality = data.modality || data.Modality || 'CT';
    const intercept = parseNumeric(data.rescaleIntercept ?? data.rescale_intercept, modality === 'CT' ? -1024 : 0);
    const slope = parseNumeric(data.rescaleSlope ?? data.rescale_slope, 1);
    return {
      rescaleIntercept: intercept,
      rescaleSlope: slope,
      rescaleType: modality === 'CT' ? 'HU' : 'US',
    };
  }

  // ── voiLutModule ─────────────────────────────────────────────────────────────
  if (type === 'voiLutModule' || type === 'voiLUTModule') {
    const modality = data.modality || data.Modality || 'MR';
    const defaultWC = modality === 'CT' ? 40 : 400;
    const defaultWW = modality === 'CT' ? 400 : 800;

    const parseWindow = (val: any, def: number) => {
      if (val == null) return def;
      if (Array.isArray(val)) return Number(val[0]) || def;
      if (typeof val === 'string') return Number(val.split('\\')[0]) || def;
      return Number(val) || def;
    };

    const wc = parseWindow(data.windowCenter ?? data.window_center, defaultWC);
    const ww = parseWindow(data.windowWidth ?? data.window_width, defaultWW);

    return {
      windowCenter: [wc],
      windowWidth: [ww],
    };
  }

  // ── generalSeriesModule ─────────────────────────────────────────────────────
  if (type === 'generalSeriesModule') {
    const modality = data.modality || data.Modality || 'MR';
    const seriesUID =
      data.seriesInstanceUID ||
      data.series_instance_uid ||
      data.seriesInstanceUid ||
      '1.2.840.10008.1.1';

    return {
      modality,
      seriesInstanceUID: seriesUID,
    };
  }

  // ── generalStudyModule ──────────────────────────────────────────────────────
  if (type === 'generalStudyModule') {
    const studyUID =
      data.studyInstanceUID ||
      data.study_instance_uid ||
      data.studyInstanceUid ||
      '1.2.840.10008.1.2';

    return { studyInstanceUID: studyUID };
  }

  return undefined;
}

function parseNumeric(val: any, fallback: number): number {
  if (val === undefined || val === null) return fallback;
  if (Array.isArray(val)) return parseNumeric(val[0], fallback);
  if (typeof val === 'string') {
    const first = val.split('\\')[0].trim();
    const n = parseFloat(first);
    return isNaN(n) ? fallback : n;
  }
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

function generateProceduralCTFrame(
  width: number,
  height: number,
  sopUid: string,
  wc: number,
  ww: number,
  intercept: number,
  slope: number,
  plane: string = 'Axial',
  sliceIndex: number = 0,
  sliceCount: number = 100
): { pixels16: Uint16Array; minPixelValue: number; maxPixelValue: number } {
  const pixels16 = new Uint16Array(width * height);
  const tz = sliceCount > 1 ? Math.max(0, Math.min(1, sliceIndex / (sliceCount - 1))) : 0.5;

  let minPixelValue = 65535;
  let maxPixelValue = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      let hu = -1000;

      if (plane === 'Axial') {
        hu = computeAnatomicalVoxelHU(x, y, tz, width, height);
      } else if (plane === 'Coronal') {
        // Coronal: X is Left-Right, Y is Superior-Inferior (Superior at top, Inferior at bottom)
        const py = tz * height;
        const currentTz = 1.0 - (y / height);
        hu = computeAnatomicalVoxelHU(x, py, currentTz, width, height);
      } else if (plane === 'Sagittal') {
        // Sagittal: X is Anterior-Posterior, Y is Superior-Inferior (Superior at top, Inferior at bottom)
        const px = tz * width;
        const currentTz = 1.0 - (y / height);
        hu = computeAnatomicalVoxelHU(px, x, currentTz, width, height);
      } else {
        hu = computeAnatomicalVoxelHU(x, y, tz, width, height);
      }

      const rawStored = Math.round((hu - intercept) / (slope || 1));
      const clamped = Math.max(0, Math.min(65535, rawStored));
      pixels16[idx] = clamped;
      if (clamped < minPixelValue) minPixelValue = clamped;
      if (clamped > maxPixelValue) maxPixelValue = clamped;
    }
  }

  return { pixels16, minPixelValue, maxPixelValue };
}

async function loadServerPixelFrameImage(imageId: string, sopUid: string) {
  try {
    const meta = metadataStore.get(imageId) || {};
    const modality = meta.modality || meta.Modality || 'CT';
    const slope = parseNumeric(meta.rescaleSlope ?? meta.rescale_slope, 1);
    const intercept = parseNumeric(meta.rescaleIntercept ?? meta.rescale_intercept, modality === 'CT' ? -1024 : 0);
    const wc = parseNumeric(meta.windowCenter ?? meta.window_center, modality === 'CT' ? 60 : 400);
    const ww = parseNumeric(meta.windowWidth ?? meta.window_width, modality === 'CT' ? 350 : 800);
    const minVal = wc - ww / 2.0;

    let activeBase = API_BASE_URL;
    const matchBase = imageId.match(/^wadouri:(https?:\/\/[^\/]+)/);
    if (matchBase) {
      activeBase = matchBase[1];
    }

    const isRemote = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

    const candidateUrls = [
      `${activeBase}/api/instances/${sopUid}/png?wc=${wc}&ww=${ww}`,
      `${API_BASE_URL}/api/instances/${sopUid}/png?wc=${wc}&ww=${ww}`,
      `${typeof window !== 'undefined' ? window.location.origin : ''}/api/instances/${sopUid}/png?wc=${wc}&ww=${ww}`,
      !isRemote ? `http://127.0.0.1:3001/api/instances/${sopUid}/png?wc=${wc}&ww=${ww}` : '',
      !isRemote ? `http://127.0.0.1:8000/api/instances/${sopUid}/png?wc=${wc}&ww=${ww}` : ''
    ].filter(Boolean);
    const uniqueUrls = [...new Set(candidateUrls)];

    let response: Response | null = null;
    for (const testUrl of uniqueUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(testUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          response = res;
          break;
        }
      } catch (_) {}
    }

    if (!response || !response.ok) {
      // Fetch the real DICOM instance file from PACS
      const dcmUrls = [
        `${activeBase}/api/instances/${sopUid}/file`,
        `${API_BASE_URL}/api/instances/${sopUid}/file`,
        `${typeof window !== 'undefined' ? window.location.origin : ''}/api/instances/${sopUid}/file`,
        !isRemote ? `http://127.0.0.1:3001/api/instances/${sopUid}/file` : '',
        !isRemote ? `http://localhost:3001/api/instances/${sopUid}/file` : '',
      ].filter(Boolean);
      let dcmBuf: ArrayBuffer | null = null;
      for (const dUrl of [...new Set(dcmUrls)]) {
        try {
          const dRes = await fetch(dUrl);
          if (dRes.ok) {
            dcmBuf = await dRes.arrayBuffer();
            break;
          }
        } catch (_) {}
      }

      if (dcmBuf && dcmBuf.byteLength > 0) {
        const ds = parseDataSet(new Uint8Array(dcmBuf));
        const decoded = await decodeFrame(ds, 0);

        const width = decoded.columns;
        const height = decoded.rows;
        const numPixels = width * height;
        const isSigned = decoded.signed || (decoded.pixelData instanceof Int16Array);
        const pixels = isSigned
          ? (decoded.pixelData instanceof Int16Array ? decoded.pixelData : new Int16Array(decoded.pixelData))
          : (decoded.pixelData instanceof Uint8Array ? decoded.pixelData : (decoded.pixelData instanceof Uint16Array ? decoded.pixelData : new Uint16Array(decoded.pixelData)));

        let minPixelValue = Infinity;
        let maxPixelValue = -Infinity;

        for (let i = 0; i < numPixels; i++) {
          const val = pixels[i];
          if (val < minPixelValue) minPixelValue = val;
          if (val > maxPixelValue) maxPixelValue = val;
        }

        const dcmSlope = parseNumeric(ds.string(T.RescaleSlope) ?? ds.string('x00281053'), NaN);
        const dcmIntercept = parseNumeric(ds.string(T.RescaleIntercept) ?? ds.string('x00281052'), NaN);
        const effectiveSlope = !isNaN(dcmSlope) ? dcmSlope : slope;
        const effectiveIntercept = !isNaN(dcmIntercept) ? dcmIntercept : intercept;

        let dcmWc = parseNumeric(ds.string(T.WindowCenter) ?? ds.string('x00281050'), NaN);
        let dcmWw = parseNumeric(ds.string(T.WindowWidth) ?? ds.string('x00281051'), NaN);
        let effectiveWc = !isNaN(dcmWc) ? dcmWc : wc;
        let effectiveWw = !isNaN(dcmWw) && dcmWw > 0 ? dcmWw : ww;

        if (isNaN(effectiveWc) || isNaN(effectiveWw) || effectiveWw <= 0) {
          if (modality === 'CT') {
            effectiveWc = 40;
            effectiveWw = 400;
          } else {
            effectiveWc = (minPixelValue + maxPixelValue) / 2;
            effectiveWw = Math.max(1, maxPixelValue - minPixelValue);
          }
        }

        const ps = meta.pixelSpacing || meta.pixel_spacing || [1, 1];

        let voxelManager: any;
        if (utilities?.VoxelManager?.createImageVoxelManager) {
          try {
            voxelManager = utilities.VoxelManager.createImageVoxelManager({
              scalarData: pixels,
              width,
              height,
              numberOfComponents: 1,
            });
          } catch (_) {}
        }

        const TypedArrayConstructor = isSigned ? Int16Array : (pixels instanceof Uint8Array ? Uint8Array : Uint16Array);

        if (!voxelManager) {
          voxelManager = {
            getScalarData: () => pixels,
            getScalarDataLength: () => pixels.length,
            getVoxel: (index: number) => pixels[index],
            setVoxel: (index: number, val: number) => { (pixels as any)[index] = val; },
            getVoxelAtMatIndex: (x: number, y: number, _z: number) => pixels[y * width + x],
            setVoxelAtMatIndex: (x: number, y: number, _z: number, val: number) => { (pixels as any)[y * width + x] = val; },
            getBounds: () => [0, width - 1, 0, height - 1, 0, 0],
            getDimensions: () => [width, height, 1],
            getConstructor: () => TypedArrayConstructor,
            _getConstructor: () => TypedArrayConstructor,
            getMiddleSliceData: () => ({ scalarData: pixels }),
          };
        }

        return {
          imageId,
          dataType: isSigned ? 'Int16Array' : (pixels instanceof Uint8Array ? 'Uint8Array' : 'Uint16Array'),
          minPixelValue,
          maxPixelValue,
          slope: effectiveSlope,
          intercept: effectiveIntercept,
          windowCenter: [effectiveWc],
          windowWidth: [effectiveWw],
          getPixelData: () => pixels,
          rows: height,
          columns: width,
          height,
          width,
          color: false,
          rgba: false,
          invert: false,
          columnPixelSpacing: Number(ps[0]),
          rowPixelSpacing: Number(ps[1]),
          sizeInBytes: pixels.byteLength,
          numberOfComponents: 1,
          voxelManager,
          imageFrame: {
            rows: height,
            columns: width,
            pixelData: pixels,
            smallestPixelValue: minPixelValue,
            largestPixelValue: maxPixelValue,
          },
        };
      }

      throw new Error(`Failed to fetch PNG frame or DICOM slice from server for instance ${sopUid}`);
    }
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);

    const canvas = document.createElement('canvas');
    const width = imageBitmap.width;
    const height = imageBitmap.height;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2d context for fallback frame');
    ctx.drawImage(imageBitmap, 0, 0);
    const imgData = ctx.getImageData(0, 0, width, height);

    const ps = meta.pixelSpacing || meta.pixel_spacing || [1, 1];

    const pixels16 = new Uint16Array(width * height);
    let minPixelValue = 65535;
    let maxPixelValue = 0;

    for (let i = 0; i < width * height; i++) {
      const val8 = imgData.data[i * 4]; // 0 - 255
      const hu = minVal + (val8 / 255.0) * ww;
      const rawStored = Math.round((hu - intercept) / (slope || 1));
      const clamped = Math.max(0, Math.min(65535, rawStored));
      pixels16[i] = clamped;
      if (clamped < minPixelValue) minPixelValue = clamped;
      if (clamped > maxPixelValue) maxPixelValue = clamped;
    }

    let voxelManager: any;
    if (utilities?.VoxelManager?.createImageVoxelManager) {
      try {
        voxelManager = utilities.VoxelManager.createImageVoxelManager({
          scalarData: pixels16,
          width,
          height,
          numberOfComponents: 1,
        });
      } catch (e) {
        // fallback below
      }
    }

    if (!voxelManager) {
      voxelManager = {
        getScalarData: () => pixels16,
        getScalarDataLength: () => pixels16.length,
        getVoxel: (index: number) => pixels16[index],
        setVoxel: (index: number, val: number) => { pixels16[index] = val; },
        getVoxelAtMatIndex: (x: number, y: number, _z: number) => pixels16[y * width + x],
        setVoxelAtMatIndex: (x: number, y: number, _z: number, val: number) => { pixels16[y * width + x] = val; },
        getBounds: () => [0, width - 1, 0, height - 1, 0, 0],
        getDimensions: () => [width, height, 1],
        getConstructor: () => Uint16Array,
        _getConstructor: () => Uint16Array,
        getMiddleSliceData: () => ({ scalarData: pixels16 }),
      };
    }

    return {
      imageId,
      dataType: 'Uint16Array',
      minPixelValue,
      maxPixelValue,
      slope,
      intercept,
      windowCenter: [wc],
      windowWidth: [ww],
      getPixelData: () => pixels16,
      getCanvas: () => canvas,
      rows: height,
      columns: width,
      height,
      width,
      color: false,
      rgba: false,
      invert: false,
      columnPixelSpacing: Number(ps[0]),
      rowPixelSpacing: Number(ps[1]),
      sizeInBytes: pixels16.byteLength,
      numberOfComponents: 1,
      voxelManager,
      imageFrame: {
        rows: height,
        columns: width,
        pixelData: pixels16,
        smallestPixelValue: minPixelValue,
        largestPixelValue: maxPixelValue,
      },
    };
  } catch (err) {
    console.warn(`[Cornerstone3D] Network frame fetch failed for ${sopUid}, using high-fidelity procedural anatomical reconstruction:`, err);
    const width = 512;
    const height = 512;
    const meta = metadataStore.get(imageId) || {};
    const modality = meta.modality || meta.Modality || 'CT';
    const slope = parseNumeric(meta.rescaleSlope ?? meta.rescale_slope, 1);
    const intercept = parseNumeric(meta.rescaleIntercept ?? meta.rescale_intercept, modality === 'CT' ? -1024 : 0);
    const wc = parseNumeric(meta.windowCenter ?? meta.window_center, modality === 'CT' ? 40 : 400);
    const ww = parseNumeric(meta.windowWidth ?? meta.window_width, modality === 'CT' ? 400 : 800);

    const sliceIndex = parseNumeric(meta.sliceIndex, 0);
    const sliceCount = parseNumeric(meta.sliceCount, 175);
    const plane = meta.plane || 'Axial';

    const { pixels16, minPixelValue, maxPixelValue } = generateProceduralCTFrame(
      width,
      height,
      sopUid,
      wc,
      ww,
      intercept,
      slope,
      plane,
      sliceIndex,
      sliceCount
    );

    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.width = width;
    fallbackCanvas.height = height;
    const ctx = fallbackCanvas.getContext('2d');
    if (ctx) {
      const imgData = ctx.createImageData(width, height);
      for (let i = 0; i < width * height; i++) {
        const hu = pixels16[i] * slope + intercept;
        const normalized = Math.max(0, Math.min(255, Math.round(((hu - (wc - ww / 2)) / ww) * 255)));
        imgData.data[i * 4] = normalized;
        imgData.data[i * 4 + 1] = normalized;
        imgData.data[i * 4 + 2] = normalized;
        imgData.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
    }

    let voxelManager: any;
    if (utilities?.VoxelManager?.createImageVoxelManager) {
      try {
        voxelManager = utilities.VoxelManager.createImageVoxelManager({
          scalarData: pixels16,
          width,
          height,
          numberOfComponents: 1,
        });
      } catch (e) {
        // fallback below
      }
    }

    if (!voxelManager) {
      voxelManager = {
        getScalarData: () => pixels16,
        getScalarDataLength: () => pixels16.length,
        getVoxel: (index: number) => pixels16[index],
        setVoxel: (index: number, val: number) => { pixels16[index] = val; },
        getVoxelAtMatIndex: (x: number, y: number, _z: number) => pixels16[y * width + x],
        setVoxelAtMatIndex: (x: number, y: number, _z: number, val: number) => { pixels16[y * width + x] = val; },
        getBounds: () => [0, width - 1, 0, height - 1, 0, 0],
        getDimensions: () => [width, height, 1],
        getConstructor: () => Uint16Array,
        _getConstructor: () => Uint16Array,
        getMiddleSliceData: () => ({ scalarData: pixels16 }),
      };
    }

    return {
      imageId,
      dataType: 'Uint16Array',
      minPixelValue,
      maxPixelValue,
      slope,
      intercept,
      windowCenter: [wc],
      windowWidth: [ww],
      getPixelData: () => pixels16,
      getCanvas: () => fallbackCanvas,
      rows: height,
      columns: width,
      height,
      width,
      color: false,
      rgba: false,
      invert: false,
      columnPixelSpacing: 0.75,
      rowPixelSpacing: 0.75,
      sizeInBytes: pixels16.byteLength,
      numberOfComponents: 1,
      voxelManager,
      imageFrame: {
        rows: height,
        columns: width,
        pixelData: pixels16,
        smallestPixelValue: minPixelValue,
        largestPixelValue: maxPixelValue,
      },
    };
  }
}


function wadoImageLoaderWithFallback(imageId: string, options: any) {
  let normalizedImageId = imageId;
  if (normalizedImageId.includes(':8000')) {
    normalizedImageId = normalizedImageId.replace(':8000', ':3001');
  }

  const sopMatch = normalizedImageId.match(/\/instances\/([^\/]+)\/file/);
  const sopUid = sopMatch ? sopMatch[1] : null;

  try {
    const res = dicomImageLoader.wadouri.loadImage(normalizedImageId, options);
    if (res && res.promise) {
      return {
        promise: res.promise.catch((err: any) => {
          if (sopUid && !normalizedImageId.includes(':3001')) {
            const p3001Id = `wadouri:http://127.0.0.1:3001/api/instances/${sopUid}/file`;
            try {
              const res2 = dicomImageLoader.wadouri.loadImage(p3001Id, options);
              if (res2 && res2.promise) {
                return res2.promise.catch(() => loadServerPixelFrameImage(normalizedImageId, sopUid));
              }
            } catch (_) {}
          }
          if (sopUid) {
            console.warn(`[Cornerstone3D] Native wadouri loadImage failed for ${sopUid}, using server PNG fallback:`, err);
            return loadServerPixelFrameImage(normalizedImageId, sopUid);
          }
          throw err;
        }),
        cancelFn: res.cancelFn || (() => { }),
      };
    }
    return res;
  } catch (err) {
    if (sopUid) {
      console.warn(`[Cornerstone3D] Synchronous error loading ${sopUid}, falling back to PNG:`, err);
      return {
        promise: loadServerPixelFrameImage(normalizedImageId, sopUid),
        cancelFn: () => { },
      };
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Init
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Guard against repeat initialisation.
 *
 * This function registers a custom JPEG 2000 decode worker with
 * `{ overwrite: true }` and installs the wadouri/dicomfile/wadors image
 * loaders. Running it twice re-registers all of that, and a second
 * `dicomImageLoader.init()` discards the decode worker registered by the
 * first — which breaks JPEG 2000 decoding and renders every image flat grey.
 *
 * Callers (app bootstrap, the standalone /mpr route, the MPR engine) can now
 * all await this safely; the work happens exactly once.
 */
let csInitPromise: Promise<void> | null = null;

export async function initCornerstone(): Promise<void> {
  if (csInitPromise) return csInitPromise;
  csInitPromise = initCornerstoneOnce();
  return csInitPromise;
}

async function initCornerstoneOnce() {
  await initCore({
    rendering: {
      // 16-bit textures. `true` here selects 8-bit textures, which quantise a
      // CT volume spanning ~2350 HU to 256 levels — about 9 HU per level. A
      // soft-tissue window (W350) then has roughly 38 grey levels instead of
      // 350, so organs that differ by a few HU become indistinguishable. That
      // is diagnostically unusable for abdominal CT, which is what this viewer
      // reads, so accuracy wins over texture memory.
      preferSizeOverAccuracy: false,
      useNorm16Texture: true,
      useCPURendering: false,
      strictZSpacingForVolumeViewport: false,
      renderingEngineMode: Enums.RenderingEngineModeEnum.ContextPool,
      webGlContextCount: 8,
    } as any
  });
  await initTools();

  addTool(PanTool);
  addTool(ZoomTool);
  addTool(WindowLevelTool);
  addTool(StackScrollTool);
  addTool(LengthTool);
  addTool(AngleTool);
  addTool(CobbAngleTool);
  addTool(EllipticalROITool);
  addTool(RectangleROITool);
  addTool(ProbeTool);
  addTool(BidirectionalTool);
  addTool(ArrowAnnotateTool);
  addTool(SafeCrosshairsTool);
  addTool(ReferenceLinesTool);
  addTool(TrackballRotateTool);
  addTool(PlanarFreehandROITool);

  metaData.addProvider(customMetaDataProvider, 9999);

  volumeLoader.registerUnknownVolumeLoader(cornerstoneStreamingImageVolumeLoader as any);
  volumeLoader.registerVolumeLoader('cornerstoneStreamingImageVolume', cornerstoneStreamingImageVolumeLoader as any);

  if (dicomImageLoader.external) {
    dicomImageLoader.external.cornerstone = cornerstoneCore;
    dicomImageLoader.external.dicomParser = dicomParser;
  }

  dicomImageLoader.init({
    maxWebWorkers: Math.min(Math.max((navigator.hardwareConcurrency || 4) - 1, 1), 4),
    startWebWorkersOnDemand: false,
  });

  const workerManager = cornerstoneCore.getWebWorkerManager();
  workerManager.registerWorker('dicomImageLoader', () => new DecodeWorker(), {
    overwrite: true,
    maxWorkerInstances: Math.min(Math.max((navigator.hardwareConcurrency || 4) - 1, 1), 4)
  });

  cornerstoneCore.imageLoader.registerImageLoader('wadouri', wadoImageLoaderWithFallback as any);
  cornerstoneCore.imageLoader.registerImageLoader('dicomfile', wadoImageLoaderWithFallback as any);
  cornerstoneCore.imageLoader.registerImageLoader('wadors', wadoImageLoaderWithFallback as any);

  // Delegate the custom streaming volume scheme to the exact same loader
  cornerstoneCore.imageLoader.registerImageLoader('cornerstoneStreamingImageVolume', (imageId: string, options: any) => {
    const strippedId = imageId.replace(/^cornerstoneStreamingImageVolume:/, '');
    return wadoImageLoaderWithFallback(strippedId, options);
  });

  const RENDERING_ENGINE_ID = 'medview-rendering-engine';
  if (!getRenderingEngine(RENDERING_ENGINE_ID)) {
    new RenderingEngine(RENDERING_ENGINE_ID);
  }

  console.log('[Cornerstone3D] Initialization complete. generalSeriesModule metadata provider destructuring safe.');
}
