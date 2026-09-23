/**
 * Ingestion pipeline (§3 → §6). Environment-agnostic: it takes bytes and returns a
 * volume, so it runs identically inside a Web Worker in the browser and inside the
 * Node validation harness.
 */
import { extractArchive, looksLikeArchive, type ExtractedFile } from './archive';
import { detectDicom } from './detect';
import { parseDataSet, readInstanceMeta } from './parser';
import { decodeFrame } from './decode/decodeFrame';
import { applyModalityLut, verifyModalityLut, theoreticalHuRange } from './modalityLut';
import { analyzeGeometry, type GeometryAnalysis } from './geometry';
import { groupIntoStudies, selectVolumeSeries, contrastLikelihood } from './seriesSelector';
import { VolumeBuilder } from '@/volume/construction';
import { computeStatistics } from '@/volume/statistics';
import { verifyVolumeGeometry, type ConformanceReport } from '@/volume/validation';
import { issue, ErrorCode, MedViewError, type DiagnosticIssue } from '@/core/errors';
import { scopedLogger } from '@/core/logger';
import type { DicomInstanceMeta, SeriesSummary, StudySummary } from './types';
import type { VolumeData } from '@/volume/types';
import type { DatasetDiagnostics } from './diagnostics';

const log = scopedLogger('ingest');

export interface ProgressEvent {
  readonly phase: 'extract' | 'scan' | 'select' | 'geometry' | 'decode' | 'statistics' | 'verify' | 'done';
  readonly done: number;
  readonly total: number;
  readonly message: string;
}
export type ProgressFn = (e: ProgressEvent) => void;

export interface InventoryResult {
  readonly diagnostics: DatasetDiagnostics;
  readonly studies: readonly StudySummary[];
  readonly selected: SeriesSummary | null;
  /** Raw bytes keyed by fileId, needed for the decode pass. */
  readonly bytesByFileId: Map<string, Uint8Array>;
}

/* ------------------------------------------------------------------ step 1-4 */

export async function inventory(
  input: ReadonlyArray<{ path: string; bytes: Uint8Array }>, onProgress?: ProgressFn,
): Promise<InventoryResult> {
  const timings: Record<string, number> = {};
  const t0 = Date.now();

  // STEP 1 — expand archives.
  onProgress?.({ phase: 'extract', done: 0, total: input.length, message: 'Expanding archives…' });
  const files: ExtractedFile[] = [];
  for (const f of input) {
    if (looksLikeArchive(f.bytes)) files.push(...extractArchive(f.bytes, f.path));
    else files.push({ path: f.path, bytes: f.bytes });
  }
  timings.extractMs = Date.now() - t0;
  if (files.length === 0) {
    throw new MedViewError({ code: ErrorCode.ARCHIVE_EMPTY, message: 'The supplied dataset contains no files.' });
  }

  // STEP 2-3 — recursive inspection and robust DICOM detection.
  const t1 = Date.now();
  const rejected: Array<{ path: string; reason: string }> = [];
  const instances: DicomInstanceMeta[] = [];
  const bytesByFileId = new Map<string, Uint8Array>();
  const issues: DiagnosticIssue[] = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (i % 25 === 0) onProgress?.({ phase: 'scan', done: i, total: files.length, message: `Reading DICOM headers (${i}/${files.length})…` });
    const det = detectDicom(f.bytes);
    if (det.kind === 'not-dicom') { rejected.push({ path: f.path, reason: det.reason }); continue; }
    try {
      const ds = parseDataSet(f.bytes, { metadataOnly: false });
      const meta = readInstanceMeta(ds, f.path, f.bytes.length);
      instances.push(meta);
      bytesByFileId.set(f.path, f.bytes);
    } catch (e) {
      const reason = e instanceof MedViewError ? (e.detail ?? e.message) : String(e);
      rejected.push({ path: f.path, reason });
      issues.push(issue(ErrorCode.DICOM_PARSE_FAILED, 'warning',
        `A file could not be parsed as DICOM and was skipped.`, { detail: `${f.path}: ${reason}` }));
    }
  }
  timings.scanMs = Date.now() - t1;

  if (instances.length === 0) {
    throw new MedViewError({
      code: ErrorCode.NO_DICOM_FOUND,
      message: `No readable DICOM files were found in the ${files.length} file${files.length === 1 ? '' : 's'} supplied.`,
      detail: rejected.slice(0, 5).map((r) => `${r.path}: ${r.reason}`).join('; '),
    });
  }

  // STEP 4 — group and select.
  const t2 = Date.now();
  onProgress?.({ phase: 'select', done: 0, total: 1, message: 'Grouping studies and series…' });
  const studies = groupIntoStudies(instances);
  const selected = selectVolumeSeries(studies);
  timings.selectMs = Date.now() - t2;

  const seriesCount = studies.reduce((a, s) => a + s.series.length, 0);
  let selectionReason: string;
  if (!selected) {
    selectionReason = 'No series in this dataset qualifies as a volumetric CT reconstruction.';
    issues.push(issue(ErrorCode.NO_VOLUMETRIC_SERIES, 'fatal',
      'This dataset contains no volumetric CT series that can be rendered in 3D.',
      { detail: studies.flatMap((s) => s.series).map((s) => `#${s.seriesNumber} "${s.seriesDescription}" → ${s.role}`).join('; ') }));
  } else {
    const rejectedSeries = studies.flatMap((s) => s.series).filter((s) => s.seriesInstanceUID !== selected.seriesInstanceUID);
    selectionReason =
      `Series ${selected.seriesNumber} "${selected.seriesDescription}" scored ${selected.volumeScore.toFixed(3)} ` +
      `(${selected.scoreReasons.join('; ')}).` +
      (rejectedSeries.length
        ? ` Excluded: ${rejectedSeries.map((s) => `#${s.seriesNumber} "${s.seriesDescription}" (${s.role})`).join(', ')}.`
        : '');
  }

  const diagnostics: DatasetDiagnostics = {
    filesFound: input.length,
    filesAfterArchiveExpansion: files.length,
    validDicomFiles: instances.length,
    rejectedFiles: rejected,
    studyCount: studies.length,
    seriesCount,
    studies,
    selectedSeriesUID: selected?.seriesInstanceUID ?? null,
    selectionReason,
    issues,
    timings,
  };

  log.info('inventory complete', {
    files: files.length, dicom: instances.length, studies: studies.length, series: seriesCount,
    selected: selected?.seriesInstanceUID ?? null, timings,
  });

  return { diagnostics, studies, selected, bytesByFileId };
}

/* -------------------------------------------------------------- step 5-7 */

export interface BuildOptions {
  /** Cap the number of voxels; larger volumes are built at reduced resolution (§26). */
  readonly maxVoxels?: number;
  readonly maxTextureDimension?: number;
  readonly onProgress?: ProgressFn;
}

export interface BuildResult {
  readonly volume: VolumeData;
  readonly analysis: GeometryAnalysis;
  readonly conformance: ConformanceReport;
  readonly huVerification: { checked: number; mismatches: number; theoreticalRange: [number, number] };
  readonly contrast: { likely: boolean; reason: string };
  readonly timings: Readonly<Record<string, number>>;
}

export async function buildVolumeFromSeries(
  series: SeriesSummary, bytesByFileId: ReadonlyMap<string, Uint8Array>, opts: BuildOptions = {},
): Promise<BuildResult> {
  const timings: Record<string, number> = {};
  const onProgress = opts.onProgress;

  const tg = Date.now();
  onProgress?.({ phase: 'geometry', done: 0, total: 1, message: 'Verifying spatial geometry…' });
  const analysis = analyzeGeometry(series.instances);
  timings.geometryMs = Date.now() - tg;

  if (!analysis.geometry || analysis.strategy === 'reject') {
    const fatal = analysis.issues.find((i) => i.severity === 'fatal');
    throw new MedViewError({
      code: fatal?.code ?? ErrorCode.GEOMETRY_MISSING,
      severity: 'fatal',
      message: fatal?.message ?? 'The spatial geometry of this series is not usable for 3D rendering.',
      detail: analysis.issues.map((i) => i.detail ?? i.message).join(' | '),
    });
  }

  const geometry = analysis.geometry;
  const voxels = geometry.dimensions[0] * geometry.dimensions[1] * geometry.dimensions[2];
  const maxVoxels = opts.maxVoxels ?? Number.POSITIVE_INFINITY;
  const maxDim = opts.maxTextureDimension ?? Number.POSITIVE_INFINITY;
  if (voxels > maxVoxels || Math.max(...geometry.dimensions) > maxDim) {
    throw new MedViewError({
      code: ErrorCode.VOLUME_TOO_LARGE,
      message: `This volume is ${geometry.dimensions.join('×')} voxels (${(voxels / 1e6).toFixed(1)} million), beyond what this device can display at full resolution.`,
      detail: `budget ${maxVoxels} voxels, max dimension ${maxDim}`,
      context: { dimensions: [...geometry.dimensions], voxels },
    });
  }

  // STEP 5-6 — decode each slice, convert to HU, place it in the volume.
  const td = Date.now();
  const builder = new VolumeBuilder(geometry, analysis);
  const slices = analysis.slices;
  let huVerification = { checked: 0, mismatches: 0 };
  const sopUIDs: string[] = [];

  for (let n = 0; n < slices.length; n++) {
    const s = slices[n];
    if (n % 10 === 0) {
      onProgress?.({ phase: 'decode', done: n, total: slices.length, message: `Decoding slice ${n + 1} of ${slices.length}…` });
      // Yield so the worker stays responsive to cancellation messages.
      await Promise.resolve();
    }
    const bytes = bytesByFileId.get(s.meta.fileId);
    if (!bytes) {
      throw new MedViewError({
        code: ErrorCode.PIXEL_DATA_MISSING,
        message: 'A slice that was inventoried is no longer available; the dataset changed during loading.',
        detail: s.meta.fileId,
      });
    }
    const ds = parseDataSet(bytes);
    const frame = await decodeFrame(ds, s.frameIndex);
    if (frame.rows !== geometry.dimensions[1] || frame.columns !== geometry.dimensions[0]) {
      throw new MedViewError({
        code: ErrorCode.GEOMETRY_MIXED_MATRIX,
        message: `A slice decoded to ${frame.columns}×${frame.rows}, which does not match the volume matrix ${geometry.dimensions[0]}×${geometry.dimensions[1]}.`,
        detail: s.meta.fileId,
      });
    }
    const lut = applyModalityLut(frame, s.meta.rescale);
    if (n === 0 || n === slices.length - 1 || n === (slices.length >> 1)) {
      const v = verifyModalityLut(frame, s.meta.rescale, lut);
      huVerification = { checked: huVerification.checked + v.checked, mismatches: huVerification.mismatches + v.mismatches };
    }
    builder.push({ values: lut.values, slice: s });
    sopUIDs.push(s.meta.sopInstanceUID);
  }
  const built = builder.finish();
  timings.decodeMs = Date.now() - td;

  // STEP 7 — statistics and verification.
  const ts = Date.now();
  onProgress?.({ phase: 'statistics', done: 0, total: 1, message: 'Computing HU statistics…' });
  const statistics = computeStatistics(built.scalars);
  timings.statisticsMs = Date.now() - ts;

  const tv = Date.now();
  onProgress?.({ phase: 'verify', done: 0, total: 1, message: 'Verifying volume geometry…' });
  const conformance = verifyVolumeGeometry(geometry, analysis);
  timings.verifyMs = Date.now() - tv;

  const first = series.instances[0];
  const theoretical = theoreticalHuRange(first.encoding, first.rescale);
  const issues: DiagnosticIssue[] = [...analysis.issues, ...conformance.issues];

  if (statistics.min < theoretical[0] - 1 || statistics.max > theoretical[1] + 1) {
    issues.push(issue(ErrorCode.PIXEL_DATA_INVALID, 'warning',
      `Measured HU range (${statistics.min} … ${statistics.max}) falls outside what this pixel encoding can represent (${theoretical[0]} … ${theoretical[1]}).`,
      { detail: 'This usually means BitsStored/HighBit/PixelRepresentation were interpreted incorrectly by the source encoder.' }));
  }
  if (huVerification.mismatches > 0) {
    issues.push(issue(ErrorCode.PIXEL_DATA_INVALID, 'error',
      `HU conversion verification failed on ${huVerification.mismatches} of ${huVerification.checked} sampled voxels.`));
  }
  if (built.writtenSlices + built.interpolatedSlices < geometry.dimensions[2]) {
    issues.push(issue(ErrorCode.GEOMETRY_MISSING_SLICES, 'warning',
      `${geometry.dimensions[2] - built.writtenSlices - built.interpolatedSlices} slice position${geometry.dimensions[2] - built.writtenSlices - built.interpolatedSlices === 1 ? '' : 's'} in the volume received no acquired data and are shown as air.`));
  }

  const isHounsfield = series.modality === 'CT';
  const volume: VolumeData = {
    id: `${series.seriesInstanceUID}:${Date.now().toString(36)}`,
    scalars: built.scalars,
    geometry,
    statistics,
    isHounsfield,
    issues,
    provenance: {
      studyInstanceUID: series.studyInstanceUID,
      seriesInstanceUID: series.seriesInstanceUID,
      frameOfReferenceUID: series.frameOfReferenceUID,
      modality: series.modality,
      seriesDescription: series.seriesDescription,
      sourceInstanceCount: slices.length,
      sourceSopInstanceUIDs: sopUIDs,
      rescaleSlope: first.rescale.slope,
      rescaleIntercept: first.rescale.intercept,
      transferSyntaxUID: series.transferSyntaxUID,
      reconstructionStrategy: analysis.strategy,
      transforms: built.transforms,
      createdAt: Date.now(),
    },
  };

  onProgress?.({ phase: 'done', done: 1, total: 1, message: 'Volume ready.' });
  log.info('volume built', {
    dimensions: [...geometry.dimensions], spacing: [...geometry.spacing],
    written: built.writtenSlices, interpolated: built.interpolatedSlices, timings,
  });

  return {
    volume, analysis, conformance,
    huVerification: { ...huVerification, theoreticalRange: theoretical },
    contrast: contrastLikelihood(series),
    timings,
  };
}
