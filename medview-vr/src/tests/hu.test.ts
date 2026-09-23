import { describe, it, expect } from 'vitest';
import { applyModalityLut, verifyModalityLut, theoreticalHuRange } from '@/dicom/modalityLut';
import { normalizeSamples } from '@/dicom/decode/decodeFrame';
import type { DecodedFrame, PixelEncoding } from '@/dicom/types';

const frame = (pixelData: Int16Array | Uint16Array, rows = 2, columns = 2): DecodedFrame => ({
  pixelData, rows, columns, samplesPerPixel: 1, signed: pixelData instanceof Int16Array, bitsStored: 12,
});

describe('HU conversion', () => {
  it('applies slope and intercept', () => {
    const r = applyModalityLut(frame(new Uint16Array([0, 1024, 2048, 4095])), { slope: 1, intercept: -1024 });
    expect(Array.from(r.values)).toEqual([-1024, 0, 1024, 3071]);
    expect(r.min).toBe(-1024);
    expect(r.max).toBe(3071);
  });

  it('handles a non-unit slope', () => {
    const r = applyModalityLut(frame(new Uint16Array([0, 100, 200, 300])), { slope: 2.5, intercept: -500 });
    expect(Array.from(r.values)).toEqual([-500, -250, 0, 250]);
    expect(r.identity).toBe(false);
  });

  it('handles signed stored values', () => {
    const r = applyModalityLut(frame(new Int16Array([-1000, 0, 1000, 3000])), { slope: 1, intercept: 0 });
    expect(Array.from(r.values)).toEqual([-1000, 0, 1000, 3000]);
    expect(r.identity).toBe(true);
  });

  it('maps pixel padding to air instead of rescaling it', () => {
    const r = applyModalityLut(frame(new Uint16Array([0, 63536 & 0xffff, 2048, 4095])), {
      slope: 1, intercept: -1024, pixelPaddingValue: 2048,
    });
    expect(r.paddedCount).toBe(1);
    expect(r.values[2]).toBe(-1024);
  });

  it('honours a pixel padding range', () => {
    const r = applyModalityLut(frame(new Uint16Array([10, 20, 30, 40])), {
      slope: 1, intercept: 0, pixelPaddingValue: 20, pixelPaddingRangeLimit: 30,
    });
    expect(r.paddedCount).toBe(2);
    expect(Array.from(r.values)).toEqual([10, -1024, -1024, 40]);
  });

  it('independently verifies its own output', () => {
    const f = frame(new Uint16Array(Array.from({ length: 64 }, (_, i) => i * 60)), 8, 8);
    const rescale = { slope: 1, intercept: -1024 };
    const r = applyModalityLut(f, rescale);
    const v = verifyModalityLut(f, rescale, r, 64);
    expect(v.checked).toBeGreaterThan(0);
    expect(v.mismatches).toBe(0);
  });

  it('reports the representable HU range of an encoding', () => {
    expect(theoreticalHuRange(
      { bitsAllocated: 16, bitsStored: 12, highBit: 11, pixelRepresentation: 0, samplesPerPixel: 1, photometricInterpretation: 'MONOCHROME2' },
      { slope: 1, intercept: -1024 },
    )).toEqual([-1024, 3071]);
    expect(theoreticalHuRange(
      { bitsAllocated: 16, bitsStored: 16, highBit: 15, pixelRepresentation: 1, samplesPerPixel: 1, photometricInterpretation: 'MONOCHROME2' },
      { slope: 1, intercept: 0 },
    )).toEqual([-32768, 32767]);
  });
});

describe('stored pixel normalisation', () => {
  const enc = (o: Partial<PixelEncoding> = {}): PixelEncoding => ({
    bitsAllocated: 16, bitsStored: 12, highBit: 11, pixelRepresentation: 0,
    samplesPerPixel: 1, photometricInterpretation: 'MONOCHROME2', ...o,
  });

  it('masks the unused high bits of a 12-in-16 encoding', () => {
    // 0xF123: the top nibble is garbage above BitsStored and must be discarded.
    const raw = new Uint8Array(new Uint16Array([0xf123, 0x0abc]).buffer);
    const out = normalizeSamples(raw, enc(), 2);
    expect(Array.from(out as Uint16Array)).toEqual([0x123, 0xabc]);
  });

  it('sign-extends a signed 12-bit value', () => {
    const raw = new Uint8Array(new Uint16Array([0x0fff, 0x0001]).buffer); // -1 and +1 in 12-bit two's complement
    const out = normalizeSamples(raw, enc({ pixelRepresentation: 1 }), 2);
    expect(Array.from(out as Int16Array)).toEqual([-1, 1]);
  });

  it('honours a non-zero HighBit shift', () => {
    // BitsStored 8 living in bits 15..8 (HighBit 15).
    const raw = new Uint8Array(new Uint16Array([0xab00, 0x3400]).buffer);
    const out = normalizeSamples(raw, enc({ bitsStored: 8, highBit: 15 }), 2);
    expect(Array.from(out as Uint16Array)).toEqual([0xab, 0x34]);
  });

  it('passes 16-bit unsigned data through unchanged', () => {
    const raw = new Uint8Array(new Uint16Array([65535, 0, 1234]).buffer);
    const out = normalizeSamples(raw, enc({ bitsStored: 16, highBit: 15 }), 3);
    expect(Array.from(out as Uint16Array)).toEqual([65535, 0, 1234]);
  });

  it('handles 8-bit allocations', () => {
    const out = normalizeSamples(new Uint8Array([0, 128, 255]), enc({ bitsAllocated: 8, bitsStored: 8, highBit: 7 }), 3);
    expect(Array.from(out as Uint8Array)).toEqual([0, 128, 255]);
  });
});
