/**
 * Binary run-length coding for byte masks.
 *
 * A segmentation or visibility mask is overwhelmingly runny, so RLE turns a 65 MB array
 * into a few kilobytes. Used both for whole-volume undo entries and for the presentation
 * state (where the bytes are then base64-encoded).
 *
 * Format: repeated 5-byte records of `value` (1 byte) followed by `runLength`
 * (uint32 little-endian).
 */
export function rleEncode(mask: Uint8Array): Uint8Array {
  // Worst case is one record per voxel, but that only happens for pure noise; grow instead.
  let cap = Math.max(64, Math.min(mask.length, 1 << 16)) * 5;
  let buf = new Uint8Array(cap);
  let o = 0;
  const ensure = (need: number) => {
    if (o + need <= cap) return;
    cap = Math.max(cap * 2, o + need);
    const next = new Uint8Array(cap);
    next.set(buf.subarray(0, o));
    buf = next;
  };
  let i = 0;
  while (i < mask.length) {
    const v = mask[i];
    let n = 1;
    while (i + n < mask.length && mask[i + n] === v && n < 0xffffffff) n++;
    ensure(5);
    buf[o++] = v;
    buf[o++] = n & 0xff;
    buf[o++] = (n >>> 8) & 0xff;
    buf[o++] = (n >>> 16) & 0xff;
    buf[o++] = (n >>> 24) & 0xff;
    i += n;
  }
  return buf.slice(0, o);
}

export function rleDecodeInto(encoded: Uint8Array, out: Uint8Array): Uint8Array {
  let o = 0;
  for (let i = 0; i + 4 < encoded.length; i += 5) {
    const v = encoded[i];
    const n = encoded[i + 1] | (encoded[i + 2] << 8) | (encoded[i + 3] << 16) | (encoded[i + 4] << 24);
    const end = Math.min(out.length, o + n);
    out.fill(v, o, end);
    o = end;
    if (o >= out.length) break;
  }
  return out;
}

export function rleDecode(encoded: Uint8Array, length: number): Uint8Array {
  return rleDecodeInto(encoded, new Uint8Array(length));
}
