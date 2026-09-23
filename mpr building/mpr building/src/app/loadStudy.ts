/**
 * Study loading pipeline.
 *
 * Order of operations is fixed and each step is a gate:
 *   files -> parse geometry -> exclude non-volumetric -> group into coherent
 *   volumes -> validate geometry -> build volume descriptor.
 *
 * Pixel data is never touched during this phase; the rendering engine decodes
 * it lazily through its own web workers, so a 1000-slice study can be
 * validated and laid out before a single frame is decompressed.
 */

import * as dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';
import {
  frameDescriptorsFromDataSet,
  readPatientStudyInfo,
  type PatientStudyInfo,
} from '../dicom/parseFrames';
import type { FrameDescriptor, SeriesGeometry } from '../core/geometry/types';
import { buildSeriesGeometry } from '../core/geometry/DICOMGeometry';
import {
  prepareCandidateVolumes,
  type SeriesFilterResult,
  type SpatialGroup,
} from '../core/volume/SeriesValidator';
import {
  createVolumeDescriptor,
  type VolumeDescriptor,
} from '../core/volume/VolumeBuilder';
import { registerFrames, registerStudyInfo } from '../engine/metadataProvider';

export interface LoadedStudy {
  readonly frames: readonly FrameDescriptor[];
  readonly candidates: readonly SpatialGroup[];
  readonly filter: SeriesFilterResult;
  readonly patientInfo: PatientStudyInfo;
  readonly failedFiles: ReadonlyArray<{ name: string; reason: string }>;
}

export interface PreparedVolume {
  readonly geometry: SeriesGeometry;
  readonly descriptor: VolumeDescriptor | null;
  readonly imageIds: string[];
  /** Present when the geometry was rejected; the UI must show this. */
  readonly blockingMessage: string | null;
}

/**
 * Register a file with the DICOM image loader and return its base imageId.
 * Frames of an Enhanced object are addressed as `<base>?frame=n`.
 */
function registerFile(file: File | Blob): string {
  return dicomImageLoader.wadouri.fileManager.add(file as File);
}

export async function loadStudyFromFiles(
  files: readonly File[],
  onProgress?: (done: number, total: number) => void,
): Promise<LoadedStudy> {
  const frames: FrameDescriptor[] = [];
  const failedFiles: Array<{ name: string; reason: string }> = [];
  let patientInfo: PatientStudyInfo = {};

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const dataSet = dicomParser.parseDicom(buffer);
      const baseImageId = registerFile(file);
      const parsed = frameDescriptorsFromDataSet(dataSet, {
        makeId: (_sop, frameIndex) =>
          frameIndex > 0 || (dataSet.string('x00280008') ?? '1') !== '1'
            ? `${baseImageId}?frame=${frameIndex}`
            : baseImageId,
      });
      if (parsed.length === 0) {
        failedFiles.push({ name: file.name, reason: 'No image frames found' });
      } else {
        frames.push(...parsed);
        if (!patientInfo.patientId) {
          patientInfo = readPatientStudyInfo(dataSet);
          for (const f of parsed) registerStudyInfo(f.id, patientInfo);
        }
      }
    } catch (error) {
      failedFiles.push({
        name: (file as File).name ?? 'unknown',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    onProgress?.(i + 1, files.length);
    if (i % 16 === 15) await Promise.resolve();
  }

  registerFrames(frames);
  const { candidates, filter } = prepareCandidateVolumes(frames);

  return { frames, candidates, filter, patientInfo, failedFiles };
}

export interface PacsInstanceItem {
  sop_instance_uid?: string;
  sopInstanceUid?: string;
  instance_number?: number;
  instanceNumber?: number;
  [key: string]: unknown;
}

export async function loadStudyFromPacs(
  studyUid: string,
  seriesUid?: string,
  apiBase: string = 'http://localhost:8000',
  onProgress?: (done: number, total: number, message?: string) => void,
): Promise<{ study: LoadedStudy; selectedSeriesUid: string }> {
  const base = apiBase.replace(/\/+$/, '');
  let targetSeriesUid = seriesUid;

  // Helper for resilient JSON fetch
  async function fetchJsonWithRetry<T = any>(url: string, retries = 3): Promise<T> {
    let lastErr: any;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return await res.json();
      } catch (err: any) {
        lastErr = err;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
      }
    }
    throw lastErr;
  }

  // Helper for resilient slice binary download with exponential backoff
  async function fetchSliceBlobWithRetry(
    fileUrl: string,
    sopUid: string,
    sliceNum: number,
    maxRetries = 5,
  ): Promise<Blob> {
    let lastErr: any;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const blob = await res.blob();
        return blob;
      } catch (err: any) {
        lastErr = err;
        if (attempt < maxRetries) {
          onProgress?.(
            completed,
            total,
            `Downloading slice ${completed}/${total} (retrying slice ${sliceNum}, attempt ${attempt}/${maxRetries})...`,
          );
          // Exponential backoff: 300ms, 750ms, 1500ms, 3000ms + random jitter
          const delay = Math.min(300 * Math.pow(2, attempt - 1) + Math.random() * 200, 4000);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw new Error(
      `Failed to download DICOM instance ${sopUid} after ${maxRetries} attempts: ${
        lastErr?.message || String(lastErr)
      }`,
    );
  }

  // 1. Discover target series if not provided
  if (!targetSeriesUid) {
    onProgress?.(0, 1, 'Discovering study series...');
    const seriesList = await fetchJsonWithRetry(
      `${base}/api/studies/${encodeURIComponent(studyUid)}/series`,
    );
    const candidates = Array.isArray(seriesList) ? seriesList : seriesList?.value || [];

    const sorted = [...candidates].sort((a: any, b: any) => {
      const aCount = a.number_of_series_related_instances || a.numberOfSeriesRelatedInstances || 0;
      const bCount = b.number_of_series_related_instances || b.numberOfSeriesRelatedInstances || 0;
      const aMod = String(a.modality || '').toUpperCase();
      const bMod = String(b.modality || '').toUpperCase();
      const aScore = (aMod === 'CT' || aMod === 'MR' ? 1000 : 0) + aCount;
      const bScore = (bMod === 'CT' || bMod === 'MR' ? 1000 : 0) + bCount;
      return bScore - aScore;
    });

    if (sorted.length === 0) {
      throw new Error(`No series found for study ${studyUid}`);
    }
    targetSeriesUid = sorted[0].series_instance_uid || sorted[0].seriesInstanceUid;
  }

  if (!targetSeriesUid) {
    throw new Error(`Could not determine series UID for study ${studyUid}`);
  }
  const seriesInstanceUid: string = targetSeriesUid;

  // 2. Fetch instances list for the target series
  onProgress?.(0, 1, 'Querying series instances...');
  const instancesData = await fetchJsonWithRetry(
    `${base}/api/series/${encodeURIComponent(seriesInstanceUid)}/instances`,
  );
  const instances: PacsInstanceItem[] = Array.isArray(instancesData)
    ? instancesData
    : instancesData?.value || [];

  if (instances.length === 0) {
    throw new Error(`Series ${targetSeriesUid} contains no instances`);
  }

  // Sort instances by instance number
  instances.sort((a, b) => {
    const numA = Number(a.instance_number ?? a.instanceNumber ?? 0);
    const numB = Number(b.instance_number ?? b.instanceNumber ?? 0);
    return numA - numB;
  });

  const total = instances.length;
  const files: File[] = new Array(total);
  let completed = 0;

  // 3. Concurrently fetch raw DICOM files
  // Using concurrency of 4-5 to avoid local socket exhaustion, keep-alive drops & ERR_NETWORK_CHANGED
  const CONCURRENCY = 5;
  let nextIdx = 0;
  let failedCount = 0;

  async function worker() {
    while (nextIdx < instances.length) {
      const current = nextIdx++;
      const inst = instances[current];
      const sopUid = String(inst.sop_instance_uid || inst.sopInstanceUid || '');
      if (!sopUid) continue;

      const fileUrl = `${base}/api/instances/${encodeURIComponent(sopUid)}/file`;
      try {
        const blob = await fetchSliceBlobWithRetry(fileUrl, sopUid, current + 1);
        files[current] = new File([blob], `${sopUid}.dcm`, { type: 'application/dicom' });
      } catch (err) {
        failedCount++;
        console.warn(`[MPR] Skipped slice ${sopUid} after repeated failures:`, err);
      } finally {
        completed++;
        onProgress?.(completed, total, `Downloading slice ${completed}/${total} from PACS`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker());
  await Promise.all(workers);

  const validFiles = files.filter(Boolean);

  if (validFiles.length === 0) {
    throw new Error(
      `Failed to download any DICOM slices from PACS (${total} failed). Please check network or PACS server.`,
    );
  }

  if (validFiles.length < Math.max(1, Math.floor(total * 0.8))) {
    throw new Error(
      `Too many slices failed to download (${validFiles.length}/${total} succeeded). Cannot build volume reliably.`,
    );
  }

  // 4. Parse geometry and create spatial candidate volumes
  onProgress?.(0, validFiles.length, 'Validating spatial geometry & building volumes...');
  const loadedStudy = await loadStudyFromFiles(validFiles, (done, count) => {
    onProgress?.(done, count, `Parsing DICOM slice ${done}/${count}`);
  });

  return { study: loadedStudy, selectedSeriesUid: seriesInstanceUid };
}

export interface PrepareOptions {
  allowMissingSlices?: boolean;
}

/**
 * Validate one candidate group and, if it is safe, produce the volume
 * descriptor and the ordered imageId list for the renderer.
 *
 * When the geometry is rejected the descriptor is null and `blockingMessage`
 * carries the clinical explanation. There is deliberately no fallback path
 * that renders a "best effort" volume.
 */
export function prepareVolume(
  group: SpatialGroup,
  options: PrepareOptions = {},
): PreparedVolume {
  const geometry = buildSeriesGeometry(group.frames, {
    allowMissingSlices: options.allowMissingSlices,
  });

  if (geometry.verdict === 'unsafe') {
    const reasons = geometry.issues
      .filter((i) => i.severity === 'error')
      .map((i) => i.message);
    return {
      geometry,
      descriptor: null,
      imageIds: [],
      blockingMessage:
        'MPR cannot be generated reliably from this series because required spatial geometry is incomplete or inconsistent.\n\n' +
        reasons.map((r) => `• ${r}`).join('\n'),
    };
  }

  const descriptor = createVolumeDescriptor(
    `${group.seriesInstanceUID}:${group.acquisitionNumber ?? 0}:${group.convolutionKernel ?? 'k'}`,
    geometry,
  );

  return {
    geometry,
    descriptor,
    // Already in validated patient-space order.
    imageIds: geometry.frames.map((f) => f.id),
    blockingMessage: null,
  };
}

/** Developer-facing dump for the diagnostic panel and the console log. */
export function describeGeometryForLog(geometry: SeriesGeometry): string {
  return [
    `Series          ${geometry.seriesInstanceUID}`,
    `FrameOfRef      ${geometry.frameOfReferenceUID ?? '(absent)'}`,
    `Modality        ${geometry.modality}`,
    `Dimensions      ${geometry.dimensions.join(' x ')}`,
    `Spacing (mm)    ${geometry.spacing.map((v) => v.toFixed(4)).join(' x ')}`,
    `Origin (mm)     ${geometry.origin.map((v) => v.toFixed(3)).join(', ')}`,
    `Row direction   ${geometry.rowDirection.map((v) => v.toFixed(6)).join(', ')}`,
    `Col direction   ${geometry.columnDirection.map((v) => v.toFixed(6)).join(', ')}`,
    `Slice normal    ${geometry.sliceNormal.map((v) => v.toFixed(6)).join(', ')}`,
    `Acquisition     ${geometry.acquisitionPlane}${geometry.oblique ? ' (oblique)' : ''}`,
    `Gantry shear    ${geometry.gantryTilt.shearAngleDeg.toFixed(3)} deg`,
    `Spacing regular ${geometry.spacingAnalysis.regular}`,
    `Verdict         ${geometry.verdict}`,
    ...geometry.issues.map((i) => `  [${i.severity}] ${i.code}: ${i.detail}`),
  ].join('\n');
}
