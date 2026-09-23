/// <reference lib="webworker" />
/** Worker: single-pass HU statistics + histogram over the assembled volume. */
import { computeStatistics } from '@/volume/statistics';
import type { StatsRequest, StatsResponse } from './protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<StatsRequest>) => {
  const msg = e.data;
  if (msg.kind !== 'stats') return;
  const statistics = computeStatistics(msg.scalars);
  const res: StatsResponse = { kind: 'stats:done', scalars: msg.scalars, statistics };
  ctx.postMessage(res, [msg.scalars.buffer, (statistics.histogram.counts as Uint32Array).buffer]);
};
