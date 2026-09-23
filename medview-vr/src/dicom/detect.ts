/**
 * Robust DICOM detection (§3 STEP 3).
 *
 * Extensions and filenames are never trusted. Two strategies:
 *   1. The 128-byte preamble followed by "DICM" (Part-10 file).
 *   2. Preamble-less streams: look for a plausible first data element at offset 0
 *      in either explicit or implicit VR little endian.
 */

const DICM = 0x4d434944; // 'DICM' little-endian

const KNOWN_VRS = new Set([
  'AE','AS','AT','CS','DA','DS','DT','FL','FD','IS','LO','LT','OB','OD','OF','OL','OV','OW',
  'PN','SH','SL','SQ','SS','ST','SV','TM','UC','UI','UL','UN','UR','US','UT','UV',
]);

export type DicomDetection =
  | { kind: 'part10'; dataOffset: number }
  | { kind: 'raw-explicit' }
  | { kind: 'raw-implicit' }
  | { kind: 'not-dicom'; reason: string };

export function detectDicom(bytes: Uint8Array): DicomDetection {
  if (bytes.length < 8) return { kind: 'not-dicom', reason: 'file shorter than 8 bytes' };

  if (bytes.length >= 132) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (dv.getUint32(128, true) === DICM) return { kind: 'part10', dataOffset: 132 };
  }

  // Preamble-less: group number of the first element should be small and even-ish.
  const dv = new DataView(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, 16));
  const group = dv.getUint16(0, true);
  if (group === 0x0002 || group === 0x0008 || group === 0x0004) {
    const vr = String.fromCharCode(bytes[4], bytes[5]);
    if (KNOWN_VRS.has(vr)) return { kind: 'raw-explicit' };
    const len = dv.getUint32(4, true);
    if (len < 0x10000) return { kind: 'raw-implicit' };
  }
  return { kind: 'not-dicom', reason: 'no DICM magic and no plausible leading data element' };
}

export function isDicom(bytes: Uint8Array): boolean {
  return detectDicom(bytes).kind !== 'not-dicom';
}
