import { T } from '../dictionary';
import { transferSyntax } from '../transferSyntax';
import { extractFrameBytes } from './frameExtract';
import { decodeRLE } from './rle';
import { decodeJ2K, decodeJLS, decodeJPEG8, decodeJPEGLossless } from './codecs';
import { MedViewError, ErrorCode } from '@3d/core/errors';
import { readPixelEncoding } from '../parser';
import type { DataSet } from '../parser';
import type { DecodedFrame, PixelEncoding } from '../types';

/**
 * Re-interpret raw sample bytes according to BitsAllocated / BitsStored / HighBit /
 * PixelRepresentation (§5). Never assumes 16-bit signed.
 */
export function normalizeSamples(raw: Uint8Array, enc: PixelEncoding, pixelCount: number): Int16Array | Uint16Array | Uint8Array {
  const { bitsAllocated, bitsStored, highBit, pixelRepresentation } = enc;
  const shift = highBit - bitsStored + 1;
  const mask = bitsStored >= 32 ? 0xffffffff : (1 << bitsStored) - 1;
  const signBit = 1 << (bitsStored - 1);

  if (bitsAllocated === 8) {
    if (pixelRepresentation === 0 && shift === 0 && bitsStored === 8) {
      return raw.length === pixelCount ? raw : raw.subarray(0, pixelCount);
    }
    const out = pixelRepresentation === 1 ? new Int16Array(pixelCount) : new Uint16Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      let v = (raw[i] >> shift) & mask;
      if (pixelRepresentation === 1 && (v & signBit)) v -= signBit << 1;
      out[i] = v;
    }
    return out;
  }

  if (bitsAllocated === 16) {
    const src = new Uint16Array(raw.buffer, raw.byteOffset, Math.min(pixelCount, raw.byteLength >> 1));
    const out = pixelRepresentation === 1 ? new Int16Array(pixelCount) : new Uint16Array(pixelCount);
    const needsWork = shift !== 0 || bitsStored !== 16;
    if (!needsWork) {
      // Fast path: a plain reinterpretation.
      if (pixelRepresentation === 1) return new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + pixelCount * 2));
      return new Uint16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + pixelCount * 2));
    }
    for (let i = 0; i < src.length; i++) {
      let v = (src[i] >> shift) & mask;
      if (pixelRepresentation === 1 && (v & signBit)) v -= signBit << 1;
      out[i] = v;
    }
    return out;
  }

  if (bitsAllocated === 32) {
    const src = new Uint32Array(raw.buffer, raw.byteOffset, Math.min(pixelCount, raw.byteLength >> 2));
    const out = new Int16Array(pixelCount);
    for (let i = 0; i < src.length; i++) {
      let v = (src[i] >>> shift) & mask;
      if (pixelRepresentation === 1 && v & signBit) v -= signBit * 2;
      out[i] = v;
    }
    return out;
  }

  throw new MedViewError({
    code: ErrorCode.PIXEL_DATA_INVALID,
    message: `Unsupported pixel encoding: ${bitsAllocated} bits allocated.`,
    detail: JSON.stringify(enc),
  });
}

/** Decode one frame of an instance into stored pixel values (before rescale). */
export async function decodeFrame(ds: DataSet, frameIndex = 0): Promise<DecodedFrame> {
  const enc = readPixelEncoding(ds);
  const rows = ds.uint16(T.Rows) ?? 0;
  const columns = ds.uint16(T.Columns) ?? 0;
  const pixelCount = rows * columns * enc.samplesPerPixel;
  const ts = transferSyntax(ds.string(T.TransferSyntaxUID) ?? '1.2.840.10008.1.2');
  const encoded = extractFrameBytes(ds, frameIndex);

  let raw: Uint8Array;
  switch (ts.codec) {
    case 'raw-le':
    case 'raw-le-implicit':
      raw = encoded;
      break;
    case 'raw-be': {
      // Byte-swap 16-bit samples into little-endian order.
      const swapped = new Uint8Array(encoded.length);
      for (let i = 0; i + 1 < encoded.length; i += 2) { swapped[i] = encoded[i + 1]; swapped[i + 1] = encoded[i]; }
      raw = swapped;
      break;
    }
    case 'rle':
      raw = decodeRLE(encoded, rows, columns, enc.bitsAllocated, enc.samplesPerPixel);
      break;
    case 'j2k':
    case 'htj2k':
      raw = (await decodeJ2K(encoded)).buffer;
      break;
    case 'jls':
      raw = (await decodeJLS(encoded)).buffer;
      break;
    case 'jpeg-baseline-8':
      raw = (await decodeJPEG8(encoded)).buffer;
      break;
    case 'jpeg-lossless':
      raw = (await decodeJPEGLossless(encoded, enc.bitsAllocated)).buffer;
      break;
    default:
      throw new MedViewError({
        code: ErrorCode.UNSUPPORTED_TRANSFER_SYNTAX,
        message: `This study uses a compression format this prototype cannot read (${ts.name}).`,
        detail: `transferSyntaxUID=${ts.uid}`,
        context: { transferSyntaxUID: ts.uid },
      });
  }

  const pixelData = normalizeSamples(raw, enc, pixelCount);
  return {
    pixelData, rows, columns,
    samplesPerPixel: enc.samplesPerPixel,
    signed: enc.pixelRepresentation === 1,
    bitsStored: enc.bitsStored,
  };
}
