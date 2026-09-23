import { percentileFromHistogram } from '@3d/math/stats';
import type { HistogramData, VolumeStatistics } from './types';

export const HIST_MIN = -1024;
export const HIST_MAX = 3072;
export const HIST_BIN_WIDTH = 4;
const HIST_BINS = (HIST_MAX - HIST_MIN) / HIST_BIN_WIDTH;

/** Single pass over the volume: exact min/max/mean/σ plus a fixed-bin HU histogram. */
export function computeStatistics(scalars: Int16Array): VolumeStatistics {
  const counts = new Uint32Array(HIST_BINS);
  let min = Number.POSITIVE_INFINITY, max = Number.NEGATIVE_INFINITY;
  let sum = 0, sumSq = 0;
  let dense = 0, air = 0;
  const n = scalars.length;

  for (let i = 0; i < n; i++) {
    const v = scalars[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v; sumSq += v * v;
    if (v > 150) dense++;
    if (v < -500) air++;
    let bin = ((v - HIST_MIN) / HIST_BIN_WIDTH) | 0;
    if (bin < 0) bin = 0; else if (bin >= HIST_BINS) bin = HIST_BINS - 1;
    counts[bin]++;
  }

  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  const histogram: HistogramData = { counts, min: HIST_MIN, binWidth: HIST_BIN_WIDTH, total: n };
  const pct = (p: number) => percentileFromHistogram(counts, HIST_MIN, HIST_BIN_WIDTH, p);

  return {
    min, max, mean, stdDev: Math.sqrt(variance),
    percentiles: {
      p001: pct(0.1), p01: pct(1), p1: pct(1), p5: pct(5), p25: pct(25),
      p50: pct(50), p75: pct(75), p95: pct(95), p99: pct(99), p999: pct(99.9),
    },
    histogram,
    denseFraction: dense / n,
    airFraction: air / n,
  };
}

/** Histogram restricted to "tissue" (excludes the air peak), used by the TF editor. */
export function tissueHistogram(h: HistogramData, fromHU = -200): { counts: Uint32Array; min: number; binWidth: number } {
  const start = Math.max(0, Math.floor((fromHU - h.min) / h.binWidth));
  return { counts: h.counts.slice(start), min: h.min + start * h.binWidth, binWidth: h.binWidth };
}
