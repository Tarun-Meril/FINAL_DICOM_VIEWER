/**
 * Main-thread orchestration of the ingestion pipeline.
 *
 * The UI thread does only bookkeeping here: archive expansion and header scanning run
 * in one worker, frame decoding runs in a pool sized to the machine, and statistics run
 * in a third worker. Nothing that touches a full slice or the whole volume runs inline.
 */
import { groupIntoStudies, selectVolumeSeries, contrastLikelihood } from '@vr/dicom/seriesSelector';
import { analyzeGeometry, type GeometryAnalysis } from '@3d/dicom/geometry';
import { VolumeBuilder } from '@vr/volume/construction';
import { verifyVolumeGeometry, type ConformanceReport } from '@vr/volume/validation';
import { theoreticalHuRange } from '@3d/dicom/modalityLut';
import { downsampleVolume, chooseDownsampleFactor } from '@3d/volume/resampling';
import { MedViewError, ErrorCode, issue, type DiagnosticIssue } from '@3d/core/errors';
import { scopedLogger } from '@3d/core/logger';
import type { DatasetDiagnostics } from '@vr/dicom/diagnostics';
import type { DicomInstanceMeta, SeriesSummary, StudySummary } from '@3d/dicom/types';
import type { VolumeData, VolumeStatistics } from '@3d/volume/types';
import type { ProgressEvent } from '@vr/dicom/ingest';
import type { ScanResponse, DecodeResponse, StatsResponse, ErrorMessage, ProgressMessage } from '@vr/workers/protocol';

const log = scopedLogger('loader');

export interface LoadOptions {
  readonly onProgress?: (e: ProgressEvent) => void;
  /** Upper bound on voxels uploaded to the GPU; larger volumes are box-filtered down. */
  readonly maxVoxels?: number;
  readonly maxTextureDimension?: number;
  readonly parallelism?: number;
  readonly signal?: AbortSignal;
}

export interface LoadResult {
  readonly diagnostics: DatasetDiagnostics;
  readonly studies: readonly StudySummary[];
  readonly series: SeriesSummary;
  readonly volume: VolumeData;
  readonly analysis: GeometryAnalysis;
  readonly conformance: ConformanceReport;
  readonly contrast: { likely: boolean; reason: string };
  readonly qualityNotice: string | null;
  readonly timings: Record<string, number>;
}

function newScanWorker(): Worker {
  return new Worker(new URL('../workers/scanWorker.ts', import.meta.url), { type: 'module' });
}
function newDecodeWorker(): Worker {
  return new Worker(new URL('../workers/decodeWorker.ts', import.meta.url), { type: 'module' });
}
function newStatsWorker(): Worker {
  return new Worker(new URL('../workers/statsWorker.ts', import.meta.url), { type: 'module' });
}

function toError(m: ErrorMessage): MedViewError {
  return new MedViewError({ code: m.code as MedViewError['code'], message: m.message, detail: m.detail });
}

export async function loadDataset(
  input: ReadonlyArray<{ path: string; buffer: ArrayBuffer }>, opts: LoadOptions = {},
): Promise<LoadResult> {
  const timings: Record<string, number> = {};
  const onProgress = opts.onProgress;
  const check = () => { if (opts.signal?.aborted) throw new MedViewError({ code: ErrorCode.INTERNAL, message: 'Loading was cancelled.' }); };

  /* ---------------------------------------------------------- scan */
  onProgress?.({ phase: 'extract', done: 0, total: input.length, message: 'Expanding the dataset…' });
  const tScan = performance.now();
  const scan = await new Promise<ScanResponse>((resolve, reject) => {
    const w = newScanWorker();
    w.onmessage = (e: MessageEvent<ScanResponse | ProgressMessage | ErrorMessage>) => {
      const m = e.data;
      if (m.kind === 'progress') { onProgress?.(m.event); return; }
      if (m.kind === 'error') { w.terminate(); reject(toError(m)); return; }
      w.terminate(); resolve(m);
    };
    w.onerror = (ev) => { w.terminate(); reject(new MedViewError({ code: ErrorCode.INTERNAL, message: 'The dataset reader failed unexpectedly.', detail: ev.message })); };
    w.postMessage({ kind: 'scan', files: input }, input.map((f) => f.buffer));
  });
  timings.scanTotalMs = performance.now() - tScan;
  timings.extractMs = Math.round(scan.extractMs);
  timings.headerScanMs = Math.round(scan.scanMs);
  check();

  if (scan.instances.length === 0) {
    throw new MedViewError({
      code: ErrorCode.NO_DICOM_FOUND,
      message: `No readable DICOM files were found in the ${input.length} item${input.length === 1 ? '' : 's'} supplied.`,
      detail: scan.rejected.slice(0, 5).map((r) => `${r.path}: ${r.reason}`).join('; '),
    });
  }

  /* -------------------------------------------------------- select */
  onProgress?.({ phase: 'select', done: 0, total: 1, message: 'Grouping studies and series…' });
  const tSel = performance.now();
  const studies = groupIntoStudies(scan.instances as DicomInstanceMeta[]);
  const series = selectVolumeSeries(studies);
  timings.selectMs = performance.now() - tSel;

  const issues: DiagnosticIssue[] = scan.rejected.length > 0
    ? [issue(ErrorCode.DICOM_PARSE_FAILED, 'info',
        `${scan.rejected.length} file${scan.rejected.length === 1 ? ' was' : 's were'} not DICOM and were ignored.`,
        { detail: scan.rejected.slice(0, 20).map((r) => `${r.path}: ${r.reason}`).join('; ') })]
    : [];

  const seriesCount = studies.reduce((a, s) => a + s.series.length, 0);
  if (!series) {
    const diag = makeDiagnostics(input.length, scan, studies, seriesCount, null,
      'No series in this dataset qualifies as a volumetric CT reconstruction.', issues, timings);
    throw new MedViewError({
      code: ErrorCode.NO_VOLUMETRIC_SERIES,
      message: 'This dataset contains no volumetric CT series that can be rendered in 3D.',
      detail: studies.flatMap((s) => s.series).map((s) => `#${s.seriesNumber} "${s.seriesDescription}" → ${s.role}`).join('; '),
      context: { diagnostics: diag },
    });
  }

  const rejectedSeries = studies.flatMap((s) => s.series).filter((s) => s.seriesInstanceUID !== series.seriesInstanceUID);
  const selectionReason =
    `Series ${series.seriesNumber} "${series.seriesDescription}" scored ${series.volumeScore.toFixed(3)} ` +
    `(${series.scoreReasons.join('; ')}).` +
    (rejectedSeries.length ? ` Excluded: ${rejectedSeries.map((s) => `#${s.seriesNumber} "${s.seriesDescription}" (${s.role})`).join(', ')}.` : '');

  /* ------------------------------------------------------ geometry */
  onProgress?.({ phase: 'geometry', done: 0, total: 1, message: 'Verifying spatial geometry…' });
  const tGeo = performance.now();
  const analysis = analyzeGeometry(series.instances);
  timings.geometryMs = performance.now() - tGeo;
  if (!analysis.geometry || analysis.strategy === 'reject') {
    const fatal = analysis.issues.find((i) => i.severity === 'fatal');
    throw new MedViewError({
      code: fatal?.code ?? ErrorCode.GEOMETRY_MISSING, severity: 'fatal',
      message: fatal?.message ?? 'The spatial geometry of this series is not usable for 3D rendering.',
      detail: analysis.issues.map((i) => i.detail ?? i.message).join(' | '),
    });
  }
  const geometry = analysis.geometry;

  /* -------------------------------------------------------- decode */
  const bytesByPath = new Map(scan.files.map((f) => [f.path, f.buffer]));
  const slices = analysis.slices;
  const parallelism = Math.max(1, Math.min(
    opts.parallelism ?? (typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) - 1 : 3), 8));
  const tDec = performance.now();
  const builder = new VolumeBuilder(geometry, analysis);
  const pending = new Map<number, DecodeResponse>();
  let nextToWrite = 0;
  let dispatched = 0;
  let completed = 0;
  const sopUIDs: string[] = slices.map((s) => s.meta.sopInstanceUID);

  onProgress?.({ phase: 'decode', done: 0, total: slices.length, message: `Decoding ${slices.length} slices on ${parallelism} worker${parallelism === 1 ? '' : 's'}…` });

  const workers = Array.from({ length: parallelism }, () => newDecodeWorker());
  try {
    await new Promise<void>((resolve, reject) => {
      let failed = false;
      const fail = (e: unknown) => { if (!failed) { failed = true; reject(e); } };

      const drain = () => {
        while (pending.has(nextToWrite)) {
          const r = pending.get(nextToWrite)!;
          pending.delete(nextToWrite);
          if (r.rows !== geometry.dimensions[1] || r.columns !== geometry.dimensions[0]) {
            fail(new MedViewError({
              code: ErrorCode.GEOMETRY_MIXED_MATRIX,
              message: `A slice decoded to ${r.columns}×${r.rows}, which does not match the volume matrix ${geometry.dimensions[0]}×${geometry.dimensions[1]}.`,
            }));
            return;
          }
          builder.push({ values: r.hu, slice: slices[nextToWrite] });
          nextToWrite++;
        }
      };

      const dispatch = (w: Worker) => {
        if (failed || dispatched >= slices.length) return;
        const id = dispatched++;
        const s = slices[id];
        const buf = bytesByPath.get(s.meta.fileId);
        if (!buf) { fail(new MedViewError({ code: ErrorCode.PIXEL_DATA_MISSING, message: 'A slice inventoried earlier is no longer available.', detail: s.meta.fileId })); return; }
        // The buffer is copied (structured clone) so the pool can retry a slice if needed.
        w.postMessage({ kind: 'decode', id, buffer: buf, frameIndex: s.frameIndex, rescale: s.meta.rescale });
      };

      for (const w of workers) {
        w.onmessage = (e: MessageEvent<DecodeResponse | ErrorMessage>) => {
          const m = e.data;
          if (m.kind === 'error') { fail(toError(m)); return; }
          pending.set(m.id, m);
          completed++;
          drain();
          if (completed % 5 === 0 || completed === slices.length) {
            onProgress?.({ phase: 'decode', done: completed, total: slices.length, message: `Decoding slice ${completed} of ${slices.length}…` });
          }
          if (opts.signal?.aborted) { fail(new MedViewError({ code: ErrorCode.INTERNAL, message: 'Loading was cancelled.' })); return; }
          if (completed === slices.length) { drain(); resolve(); return; }
          dispatch(w);
        };
        w.onerror = (ev) => fail(new MedViewError({ code: ErrorCode.INTERNAL, message: 'A decoding worker failed unexpectedly.', detail: ev.message }));
      }
      // Prime the pool with two slices each to hide message latency.
      for (let round = 0; round < 2; round++) for (const w of workers) dispatch(w);
    });
  } finally {
    for (const w of workers) w.terminate();
  }
  const built = builder.finish();
  timings.decodeMs = performance.now() - tDec;
  check();

  /* ---------------------------------------------------- statistics */
  onProgress?.({ phase: 'statistics', done: 0, total: 1, message: 'Computing HU statistics…' });
  const tStat = performance.now();
  const { scalars, statistics } = await new Promise<{ scalars: Int16Array; statistics: VolumeStatistics }>((resolve, reject) => {
    const w = newStatsWorker();
    w.onmessage = (e: MessageEvent<StatsResponse>) => {
      w.terminate();
      resolve({ scalars: e.data.scalars, statistics: e.data.statistics as VolumeStatistics });
    };
    w.onerror = (ev) => { w.terminate(); reject(new MedViewError({ code: ErrorCode.INTERNAL, message: 'Statistics computation failed.', detail: ev.message })); };
    w.postMessage({ kind: 'stats', scalars: built.scalars }, [built.scalars.buffer]);
  });
  timings.statisticsMs = performance.now() - tStat;

  /* ---------------------------------------------------- verification */
  const tVer = performance.now();
  const conformance = verifyVolumeGeometry(geometry, analysis);
  timings.verifyMs = performance.now() - tVer;

  const first = series.instances[0];
  const theoretical = theoreticalHuRange(first.encoding, first.rescale);
  const volumeIssues: DiagnosticIssue[] = [...analysis.issues, ...conformance.issues];
  if (statistics.min < theoretical[0] - 1 || statistics.max > theoretical[1] + 1) {
    volumeIssues.push(issue(ErrorCode.PIXEL_DATA_INVALID, 'warning',
      `Measured HU range (${statistics.min} … ${statistics.max}) falls outside what this pixel encoding can represent (${theoretical[0]} … ${theoretical[1]}).`));
  }

  let volume: VolumeData = {
    id: `${series.seriesInstanceUID}:${Date.now().toString(36)}`,
    scalars, geometry, statistics,
    isHounsfield: series.modality === 'CT',
    issues: volumeIssues,
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

  /* ----------------------------------------- GPU budget / fallback (§26) */
  let qualityNotice: string | null = null;
  const maxVoxels = opts.maxVoxels ?? Number.POSITIVE_INFINITY;
  const maxDim = opts.maxTextureDimension ?? Number.POSITIVE_INFINITY;
  const factor = chooseDownsampleFactor(geometry.dimensions, maxVoxels, maxDim);
  if (factor[0] > 1 || factor[1] > 1 || factor[2] > 1) {
    const tDs = performance.now();
    const full = volume;
    volume = downsampleVolume(full, factor);
    timings.downsampleMs = performance.now() - tDs;
    qualityNotice =
      `Reduced resolution: displaying ${volume.geometry.dimensions.join('×')} voxels ` +
      `(${volume.geometry.spacing.map((v) => v.toFixed(2)).join(' × ')} mm) instead of ${full.geometry.dimensions.join('×')} ` +
      `because the full volume exceeds this device's graphics limits.`;
    log.warn('volume downsampled for GPU limits', { factor, from: [...full.geometry.dimensions], to: [...volume.geometry.dimensions] });
  }

  const diagnostics = makeDiagnostics(input.length, scan, studies, seriesCount, series.seriesInstanceUID, selectionReason, issues, timings);
  onProgress?.({ phase: 'done', done: 1, total: 1, message: 'Volume ready.' });
  log.info('dataset loaded', { timings, dimensions: [...volume.geometry.dimensions], qualityNotice });

  return {
    diagnostics, studies, series, volume, analysis, conformance,
    contrast: contrastLikelihood(series), qualityNotice, timings,
  };
}

function makeDiagnostics(
  filesFound: number, scan: ScanResponse, studies: StudySummary[], seriesCount: number,
  selectedUID: string | null, selectionReason: string, issues: DiagnosticIssue[],
  timings: Record<string, number>,
): DatasetDiagnostics {
  return {
    filesFound,
    filesAfterArchiveExpansion: scan.instances.length + scan.rejected.length,
    validDicomFiles: scan.instances.length,
    rejectedFiles: scan.rejected,
    studyCount: studies.length,
    seriesCount,
    studies,
    selectedSeriesUID: selectedUID,
    selectionReason,
    issues,
    timings: Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, Math.round(v)])),
  };
}
