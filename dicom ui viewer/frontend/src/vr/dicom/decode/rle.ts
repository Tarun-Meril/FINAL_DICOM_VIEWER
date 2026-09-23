/** DICOM RLE Lossless (PS3.5 Annex G) decoder. */
export function decodeRLE(
  encoded: Uint8Array, rows: number, columns: number, bitsAllocated: number, samplesPerPixel: number,
): Uint8Array {
  const dv = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  const segmentCount = dv.getUint32(0, true);
  const bytesPerSample = Math.ceil(bitsAllocated / 8);
  const pixelCount = rows * columns;
  const out = new Uint8Array(pixelCount * bytesPerSample * samplesPerPixel);

  for (let s = 0; s < segmentCount; s++) {
    const offset = dv.getUint32(4 + s * 4, true);
    if (offset === 0) continue;
    const end = s + 1 < segmentCount ? (dv.getUint32(4 + (s + 1) * 4, true) || encoded.length) : encoded.length;
    // Segment s holds byte plane (bytesPerSample-1 - s%bytesPerSample) of sample s/bytesPerSample.
    const sample = Math.floor(s / bytesPerSample);
    const bytePlane = bytesPerSample - 1 - (s % bytesPerSample);
    let ip = offset;
    let op = sample * pixelCount * bytesPerSample + bytePlane;
    const stride = bytesPerSample;
    const limit = out.length;
    while (ip < end && op < limit) {
      const n = (encoded[ip++] << 24) >> 24; // sign-extend int8
      if (n >= 0) {
        for (let i = 0; i <= n && ip < end && op < limit; i++) { out[op] = encoded[ip++]; op += stride; }
      } else if (n !== -128) {
        const v = encoded[ip++];
        for (let i = 0; i < 1 - n && op < limit; i++) { out[op] = v; op += stride; }
      }
    }
  }
  return out;
}
