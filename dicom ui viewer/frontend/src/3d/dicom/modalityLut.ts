import type { DecodedFrame, RescaleInfo, PixelEncoding } from './types';

/**
 * Modality LUT (§5): HU = storedValue * RescaleSlope + RescaleIntercept.
 *
 * Pixel padding is honoured: padded samples are mapped to `paddingOutputValue`
 * (default -1024 HU, i.e. air) instead of being rescaled, because padding is a
 * sentinel and not a measured attenuation.
 */
export interface ModalityLutOptions {
  /** HU value written where a sample equals the pixel-padding sentinel. */
  paddingOutputValue?: number;
  /** Clamp to the Int16 range after rescaling. CT HU never legitimately exceeds it. */
  clampToInt16?: boolean;
}

export interface ModalityLutResult {
  readonly values: Int16Array;
  readonly min: number;
  readonly max: number;
  readonly paddedCount: number;
  /** True when slope/intercept were 1/0, i.e. stored values already were the output. */
  readonly identity: boolean;
}

export function applyModalityLut(
  frame: DecodedFrame, rescale: RescaleInfo, opts: ModalityLutOptions = {},
): ModalityLutResult {
  const { slope, intercept } = rescale;
  const paddingOut = opts.paddingOutputValue ?? -1024;
  const src = frame.pixelData;
  const n = frame.rows * frame.columns;
  const out = new Int16Array(n);

  const padLow = rescale.pixelPaddingValue;
  const padHigh = rescale.pixelPaddingRangeLimit;
  const hasPadRange = padLow !== undefined && padHigh !== undefined;
  let paddedCount = 0;
  let min = Number.POSITIVE_INFINITY, max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < n; i++) {
    const s = src[i];
    let v: number;
    if (padLow !== undefined && (hasPadRange ? s >= Math.min(padLow, padHigh!) && s <= Math.max(padLow, padHigh!) : s === padLow)) {
      v = paddingOut; paddedCount++;
    } else {
      v = s * slope + intercept;
    }
    // CT HU is defined on an integer scale; rounding here is exact for slope=1.
    v = v >= 0 ? (v + 0.5) | 0 : -((-v + 0.5) | 0);
    if (opts.clampToInt16 !== false) v = v < -32768 ? -32768 : v > 32767 ? 32767 : v;
    out[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { values: out, min, max, paddedCount, identity: slope === 1 && intercept === 0 };
}

/** Verification step required by §5: recompute a sparse sample independently. */
export function verifyModalityLut(
  frame: DecodedFrame, rescale: RescaleInfo, result: ModalityLutResult, samples = 512,
): { checked: number; mismatches: number } {
  const n = frame.rows * frame.columns;
  const step = Math.max(1, Math.floor(n / samples));
  let checked = 0, mismatches = 0;
  for (let i = 0; i < n; i += step) {
    const s = frame.pixelData[i];
    if (rescale.pixelPaddingValue !== undefined && s === rescale.pixelPaddingValue) continue;
    const expect = Math.round(s * rescale.slope + rescale.intercept);
    checked++;
    if (result.values[i] !== Math.max(-32768, Math.min(32767, expect))) mismatches++;
  }
  return { checked, mismatches };
}

/** Sanity bounds for the given encoding, used to flag implausible HU ranges. */
export function theoreticalHuRange(enc: PixelEncoding, rescale: RescaleInfo): [number, number] {
  const maxStored = enc.pixelRepresentation === 1 ? (1 << (enc.bitsStored - 1)) - 1 : (1 << enc.bitsStored) - 1;
  const minStored = enc.pixelRepresentation === 1 ? -(1 << (enc.bitsStored - 1)) : 0;
  const a = minStored * rescale.slope + rescale.intercept;
  const b = maxStored * rescale.slope + rescale.intercept;
  return [Math.min(a, b), Math.max(a, b)];
}
