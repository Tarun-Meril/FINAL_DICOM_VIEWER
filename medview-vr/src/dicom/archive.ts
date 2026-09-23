/**
 * Compressed dataset ingestion (§3 STEP 1-2).
 *
 * Supported containers: ZIP (incl. nested), GZIP, TAR, TAR.GZ. 7z is NOT supported in
 * the browser (no permissively licensed pure-JS LZMA/Bcj2 implementation of adequate
 * quality); the user is told so explicitly instead of silently dropping the file.
 */
import { unzipSync, gunzipSync } from 'fflate';
import { MedViewError, ErrorCode } from '@/core/errors';

export interface ExtractedFile {
  /** Path inside the archive, or the original filename for loose files. */
  readonly path: string;
  readonly bytes: Uint8Array;
}

const MAX_NESTING = 3;

function isZip(b: Uint8Array): boolean {
  return b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7);
}
function isGzip(b: Uint8Array): boolean { return b.length > 2 && b[0] === 0x1f && b[1] === 0x8b; }
function is7z(b: Uint8Array): boolean {
  return b.length > 6 && b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc && b[3] === 0xaf && b[4] === 0x27 && b[5] === 0x1c;
}
function isRar(b: Uint8Array): boolean {
  return b.length > 6 && b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21;
}
function isTar(b: Uint8Array): boolean {
  if (b.length < 512) return false;
  const magic = String.fromCharCode(b[257], b[258], b[259], b[260], b[261]);
  return magic === 'ustar';
}

/** Minimal POSIX/USTAR tar reader (no external dependency). */
export function untar(bytes: Uint8Array): ExtractedFile[] {
  const out: ExtractedFile[] = [];
  const dec = new TextDecoder('utf-8');
  let off = 0;
  while (off + 512 <= bytes.length) {
    const header = bytes.subarray(off, off + 512);
    if (header.every((v) => v === 0)) break;
    const nameRaw = dec.decode(header.subarray(0, 100)).replace(/\0.*$/, '').trim();
    const prefix = dec.decode(header.subarray(345, 500)).replace(/\0.*$/, '').trim();
    const sizeStr = dec.decode(header.subarray(124, 136)).replace(/\0.*$/, '').trim();
    const size = Number.parseInt(sizeStr, 8) || 0;
    const typeFlag = String.fromCharCode(header[156]);
    off += 512;
    if (typeFlag === '0' || typeFlag === '\0') {
      out.push({ path: prefix ? `${prefix}/${nameRaw}` : nameRaw, bytes: bytes.subarray(off, off + size) });
    }
    off += Math.ceil(size / 512) * 512;
  }
  return out;
}

/**
 * Recursively expand an archive into a flat list of files. Directory entries and
 * common junk (`__MACOSX`, `.DS_Store`, `Thumbs.db`) are dropped.
 */
export function extractArchive(bytes: Uint8Array, name = 'archive', depth = 0): ExtractedFile[] {
  if (depth > MAX_NESTING) return [{ path: name, bytes }];

  if (is7z(bytes)) {
    throw new MedViewError({
      code: ErrorCode.ARCHIVE_UNREADABLE,
      message: '7-Zip archives cannot be opened in the browser. Please supply the study as a ZIP, TAR or TAR.GZ archive, or as loose DICOM files.',
      detail: `file "${name}" has a 7z signature`,
    });
  }
  if (isRar(bytes)) {
    throw new MedViewError({
      code: ErrorCode.ARCHIVE_UNREADABLE,
      message: 'RAR archives cannot be opened in the browser. Please supply the study as a ZIP, TAR or TAR.GZ archive, or as loose DICOM files.',
      detail: `file "${name}" has a RAR signature`,
    });
  }

  if (isZip(bytes)) {
    let entries: Record<string, Uint8Array>;
    try { entries = unzipSync(bytes); }
    catch (e) {
      throw new MedViewError({
        code: ErrorCode.ARCHIVE_UNREADABLE,
        message: 'The ZIP archive could not be opened; it may be corrupt or password protected.',
        detail: e instanceof Error ? e.message : String(e),
      });
    }
    const out: ExtractedFile[] = [];
    for (const [path, data] of Object.entries(entries)) {
      if (path.endsWith('/') || data.length === 0) continue;
      if (shouldIgnore(path)) continue;
      out.push(...extractArchive(data, path, depth + 1));
    }
    return out;
  }

  if (isGzip(bytes)) {
    let inner: Uint8Array;
    try { inner = gunzipSync(bytes); }
    catch (e) {
      throw new MedViewError({
        code: ErrorCode.ARCHIVE_UNREADABLE,
        message: 'The GZIP archive could not be decompressed.',
        detail: e instanceof Error ? e.message : String(e),
      });
    }
    return extractArchive(inner, name.replace(/\.g?z$/i, ''), depth + 1);
  }

  if (isTar(bytes)) {
    return untar(bytes).filter((f) => !shouldIgnore(f.path)).flatMap((f) => extractArchive(f.bytes, f.path, depth + 1));
  }

  return [{ path: name, bytes }];
}

function shouldIgnore(path: string): boolean {
  const base = path.split('/').pop() ?? path;
  if (path.includes('__MACOSX/')) return true;
  if (base.startsWith('._')) return true;
  return base === '.DS_Store' || base === 'Thumbs.db' || base.toUpperCase() === 'DICOMDIR';
}

export function looksLikeArchive(bytes: Uint8Array): boolean {
  return isZip(bytes) || isGzip(bytes) || isTar(bytes) || is7z(bytes) || isRar(bytes);
}
