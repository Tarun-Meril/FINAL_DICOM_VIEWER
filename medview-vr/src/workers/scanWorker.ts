/// <reference lib="webworker" />
/**
 * Worker 1: archive expansion + DICOM header scan. Both are CPU-bound and would
 * otherwise stall the UI on a multi-hundred-file study.
 */
import { extractArchive, looksLikeArchive } from '@/dicom/archive';
import { detectDicom } from '@/dicom/detect';
import { parseDataSet, readInstanceMeta } from '@/dicom/parser';
import { MedViewError } from '@/core/errors';
import type { ScanRequest, ScanResponse, ProgressMessage, ErrorMessage } from './protocol';
import type { DicomInstanceMeta } from '@/dicom/types';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<ScanRequest>) => {
  const msg = e.data;
  if (msg.kind !== 'scan') return;
  try {
    const t0 = performance.now();
    const expanded: Array<{ path: string; bytes: Uint8Array }> = [];
    for (const f of msg.files) {
      const bytes = new Uint8Array(f.buffer);
      if (looksLikeArchive(bytes)) {
        for (const x of extractArchive(bytes, f.path)) expanded.push({ path: x.path, bytes: x.bytes });
      } else {
        expanded.push({ path: f.path, bytes });
      }
    }
    const extractMs = performance.now() - t0;

    const t1 = performance.now();
    const instances: DicomInstanceMeta[] = [];
    const rejected: Array<{ path: string; reason: string }> = [];
    const kept: Array<{ path: string; buffer: ArrayBuffer }> = [];
    const transfers: ArrayBuffer[] = [];

    for (let i = 0; i < expanded.length; i++) {
      const f = expanded[i];
      if (i % 20 === 0) {
        const p: ProgressMessage = { kind: 'progress', event: { phase: 'scan', done: i, total: expanded.length, message: `Reading DICOM headers (${i}/${expanded.length})…` } };
        ctx.postMessage(p);
      }
      if (detectDicom(f.bytes).kind === 'not-dicom') {
        rejected.push({ path: f.path, reason: 'no DICOM magic and no plausible leading data element' });
        continue;
      }
      try {
        const ds = parseDataSet(f.bytes);
        instances.push(readInstanceMeta(ds, f.path, f.bytes.length));
        // Copy into a standalone buffer so it can be transferred back without
        // dragging the whole archive with it.
        const copy = f.bytes.byteOffset === 0 && f.bytes.byteLength === f.bytes.buffer.byteLength
          ? (f.bytes.buffer as ArrayBuffer)
          : f.bytes.slice().buffer;
        kept.push({ path: f.path, buffer: copy });
        transfers.push(copy);
      } catch (err) {
        rejected.push({ path: f.path, reason: err instanceof MedViewError ? (err.detail ?? err.message) : String(err) });
      }
    }
    const scanMs = performance.now() - t1;
    const res: ScanResponse = { kind: 'scan:done', instances, rejected, files: kept, extractMs, scanMs };
    ctx.postMessage(res, transfers);
  } catch (err) {
    const e2: ErrorMessage = {
      kind: 'error',
      code: err instanceof MedViewError ? err.code : 'INTERNAL',
      message: err instanceof Error ? err.message : String(err),
      detail: err instanceof MedViewError ? err.detail : undefined,
    };
    ctx.postMessage(e2);
  }
};
