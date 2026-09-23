/** Percentile from a cumulative histogram. `counts[i]` covers [min + i*binWidth, ...). */
export function percentileFromHistogram(
  counts: Readonly<Uint32Array | number[]>, min: number, binWidth: number, p: number,
): number {
  let total = 0;
  for (let i = 0; i < counts.length; i++) total += counts[i];
  if (total === 0) return min;
  const target = (p / 100) * total;
  let acc = 0;
  for (let i = 0; i < counts.length; i++) {
    acc += counts[i];
    if (acc >= target) {
      const within = counts[i] === 0 ? 0 : (target - (acc - counts[i])) / counts[i];
      return min + (i + within) * binWidth;
    }
  }
  return min + counts.length * binWidth;
}

export function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
