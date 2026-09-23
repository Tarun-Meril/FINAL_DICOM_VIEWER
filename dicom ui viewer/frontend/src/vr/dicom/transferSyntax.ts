export type CodecKind =
  | 'raw-le' | 'raw-le-implicit' | 'raw-be'
  | 'rle' | 'jpeg-baseline-8' | 'jpeg-lossless' | 'jls' | 'j2k' | 'htj2k' | 'unsupported';

export interface TransferSyntaxInfo {
  readonly uid: string;
  readonly name: string;
  readonly codec: CodecKind;
  readonly encapsulated: boolean;
  readonly littleEndian: boolean;
  readonly explicitVR: boolean;
  readonly lossy: boolean;
}

const TABLE: Record<string, Omit<TransferSyntaxInfo, 'uid'>> = {
  '1.2.840.10008.1.2':      { name: 'Implicit VR Little Endian',  codec: 'raw-le-implicit', encapsulated: false, littleEndian: true,  explicitVR: false, lossy: false },
  '1.2.840.10008.1.2.1':    { name: 'Explicit VR Little Endian',  codec: 'raw-le',          encapsulated: false, littleEndian: true,  explicitVR: true,  lossy: false },
  '1.2.840.10008.1.2.1.99': { name: 'Deflated Explicit VR LE',    codec: 'raw-le',          encapsulated: false, littleEndian: true,  explicitVR: true,  lossy: false },
  '1.2.840.10008.1.2.2':    { name: 'Explicit VR Big Endian',     codec: 'raw-be',          encapsulated: false, littleEndian: false, explicitVR: true,  lossy: false },
  '1.2.840.10008.1.2.5':    { name: 'RLE Lossless',               codec: 'rle',             encapsulated: true,  littleEndian: true,  explicitVR: true,  lossy: false },
  '1.2.840.10008.1.2.4.50': { name: 'JPEG Baseline (Process 1)',  codec: 'jpeg-baseline-8', encapsulated: true,  littleEndian: true,  explicitVR: true,  lossy: true },
  '1.2.840.10008.1.2.4.51': { name: 'JPEG Extended (Process 2&4)',codec: 'jpeg-baseline-8', encapsulated: true,  littleEndian: true,  explicitVR: true,  lossy: true },
  '1.2.840.10008.1.2.4.57': { name: 'JPEG Lossless, Non-Hier.',   codec: 'jpeg-lossless',   encapsulated: true,  littleEndian: true,  explicitVR: true,  lossy: false },
  '1.2.840.10008.1.2.4.70': { name: 'JPEG Lossless, SV1',         codec: 'jpeg-lossless',   encapsulated: true,  littleEndian: true,  explicitVR: true,  lossy: false },
  '1.2.840.10008.1.2.4.80': { name: 'JPEG-LS Lossless',           codec: 'jls',             encapsulated: true,  littleEndian: true,  explicitVR: true,  lossy: false },
  '1.2.840.10008.1.2.4.81': { name: 'JPEG-LS Near-Lossless',      codec: 'jls',             encapsulated: true,  littleEndian: true,  explicitVR: true,  lossy: true },
  '1.2.840.10008.1.2.4.90': { name: 'JPEG 2000 Image Compression (Lossless Only)', codec: 'j2k', encapsulated: true, littleEndian: true, explicitVR: true, lossy: false },
  '1.2.840.10008.1.2.4.91': { name: 'JPEG 2000 Image Compression', codec: 'j2k',            encapsulated: true,  littleEndian: true,  explicitVR: true,  lossy: true },
  '1.2.840.10008.1.2.4.92': { name: 'JPEG 2000 Part 2 Multi-comp (Lossless)', codec: 'j2k',  encapsulated: true,  littleEndian: true,  explicitVR: true,  lossy: false },
  '1.2.840.10008.1.2.4.93': { name: 'JPEG 2000 Part 2 Multi-comp', codec: 'j2k',            encapsulated: true,  littleEndian: true,  explicitVR: true,  lossy: true },
  '1.2.840.10008.1.2.4.201':{ name: 'High-Throughput JPEG 2000 (Lossless)', codec: 'htj2k',  encapsulated: true,  littleEndian: true,  explicitVR: true,  lossy: false },
  '1.2.840.10008.1.2.4.202':{ name: 'High-Throughput JPEG 2000 RPCL (Lossless)', codec: 'htj2k', encapsulated: true, littleEndian: true, explicitVR: true, lossy: false },
  '1.2.840.10008.1.2.4.203':{ name: 'High-Throughput JPEG 2000',   codec: 'htj2k',           encapsulated: true,  littleEndian: true,  explicitVR: true,  lossy: true },
};

export function transferSyntax(uid: string): TransferSyntaxInfo {
  const e = TABLE[uid];
  if (!e) {
    return { uid, name: `Unknown transfer syntax (${uid})`, codec: 'unsupported', encapsulated: true, littleEndian: true, explicitVR: true, lossy: false };
  }
  return { uid, ...e };
}

export function isSupported(uid: string): boolean {
  return transferSyntax(uid).codec !== 'unsupported';
}
