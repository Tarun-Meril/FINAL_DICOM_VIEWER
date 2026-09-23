/// <reference lib="webworker" />
/**
 * Worker 2..N: decode one frame and convert it to Hounsfield Units. One instance per
 * CPU core; the pool owner feeds them slices and receives transferred Int16 arrays.
 */
import { parseDataSet } from '@/dicom/parser';
import { decodeFrame } from '@/dicom/decode/decodeFrame';
import { applyModalityLut } from '@/dicom/modalityLut';
import { MedViewError } from '@/core/errors';
import type { DecodeRequest, DecodeResponse, ErrorMessage } from './protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<DecodeRequest>) => {
  const msg = e.data;
  if (msg.kind !== 'decode') return;
  const t0 = performance.now();
  try {
    const ds = parseDataSet(new Uint8Array(msg.buffer));
    const frame = await decodeFrame(ds, msg.frameIndex);
    const lut = applyModalityLut(frame, msg.rescale);
    const res: DecodeResponse = {
      kind: 'decode:done', id: msg.id, hu: lut.values,
      rows: frame.rows, columns: frame.columns,
      min: lut.min, max: lut.max, decodeMs: performance.now() - t0,
    };
    ctx.postMessage(res, [lut.values.buffer]);
  } catch (err) {
    const e2: ErrorMessage = {
      kind: 'error',
      code: err instanceof MedViewError ? err.code : 'INTERNAL',
      message: err instanceof Error ? err.message : String(err),
      detail: `slice id ${msg.id}` + (err instanceof MedViewError && err.detail ? `: ${err.detail}` : ''),
    };
    ctx.postMessage(e2);
  }
};
