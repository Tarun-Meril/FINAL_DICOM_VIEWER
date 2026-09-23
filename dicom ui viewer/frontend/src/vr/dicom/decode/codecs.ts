/**
 * WASM codec wrappers. All instantiation is lazy and cached so a worker pays the
 * module-compile cost once, then decodes thousands of frames.
 */
import { MedViewError, ErrorCode } from '@3d/core/errors';

type AnyModule = Record<string, any>;

/** Emscripten modules print progress to stdout by default; medical pixel data must not
 *  leak into logs (§40) and the noise is useless, so both streams are silenced. */
const QUIET = {
  print: () => {},
  printErr: () => {},
  /** The emscripten glue resolves its .wasm relative to the bundled script, which Vite
   *  content-hashes; `tools/copy-wasm.mjs` stages the binaries under /wasm instead. */
  locateFile: (file: string) => (file.endsWith('.wasm') ? `${baseUrl()}wasm/${file}` : file),
};

function baseUrl(): string {
  // In Node.js environment (tests, scripts), locate relative to public directory
  if (typeof process !== 'undefined' && process.versions?.node) {
    return (process.cwd().replace(/\\/g, '/') + '/public/');
  }
  // In a Worker, import.meta.env might not be available or might be different
  try {
    const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL;
    if (base) {
      return base.endsWith('/') ? base : `${base}/`;
    }
  } catch (e) {
    // import.meta might not be available in Worker
  }

  // Fallback: try to get the base from globalThis.location in Worker context
  try {
    const g = typeof globalThis !== 'undefined' ? (globalThis as any) : null;
    if (g?.location?.origin) {
      const origin = g.location.origin;
      return origin ? `${origin}/` : '/';
    }
  } catch (e) {
    // Not in Worker or location not available
  }

  return '/';
}

let openjpegPromise: Promise<AnyModule> | null = null;
let charlsPromise: Promise<AnyModule> | null = null;
let libjpegPromise: Promise<AnyModule> | null = null;

async function instantiate(loader: () => Promise<any>): Promise<AnyModule> {
  const m = await loader();

  let factory = typeof m?.default === 'function' ? m.default : typeof m === 'function' ? m : null;

  if (!factory && typeof m === 'object' && m !== null) {
    for (const key of Object.keys(m)) {
      if (typeof m[key] === 'function') {
        factory = m[key];
        break;
      }
    }
  }

  // If already an initialized Emscripten module containing the decoder
  if (!factory && m && (m.J2KDecoder || m.CharLSDecoder || m.JPEGDecoder || m.default?.J2KDecoder || m.default?.CharLSDecoder || m.default?.JPEGDecoder)) {
    return m.default?.J2KDecoder || m.default?.CharLSDecoder || m.default?.JPEGDecoder ? m.default : m;
  }

  if (typeof factory !== 'function') {
    const moduleKeys = m && typeof m === 'object' ? Object.keys(m).slice(0, 15) : [];
    console.error('[codecs] Module did not export a factory function', {
      moduleKeys,
      defaultType: typeof m?.default,
      moduleType: typeof m,
      factoryType: typeof factory,
    });
    throw new Error(`Codec factory is not a function: got ${typeof factory}`);
  }

  return await factory({ ...QUIET });
}

async function loadOpenJpeg(): Promise<AnyModule> {
  // The WASM build is ~5-10x faster than the asm.js fallback; both expose J2KDecoder.
  if (!openjpegPromise) {
    openjpegPromise = (async () => {
      try {
        return await instantiate(() => import('@cornerstonejs/codec-openjpeg/decodewasmjs'));
      } catch (wasmError) {
        console.warn('[codecs] WASM OpenJPEG failed, trying JS fallback', wasmError);
        try {
          return await instantiate(() => import('@cornerstonejs/codec-openjpeg/decode'));
        } catch (jsError) {
          console.error('[codecs] Both OpenJPEG variants failed', { wasmError, jsError });
          throw jsError;
        }
      }
    })();
  }
  return openjpegPromise;
}
async function loadCharls(): Promise<AnyModule> {
  if (!charlsPromise) {
    charlsPromise = (async () => {
      try {
        return await instantiate(() => import('@cornerstonejs/codec-charls/decodewasmjs'));
      } catch (wasmError) {
        console.warn('[codecs] WASM Charls failed, trying JS fallback', wasmError);
        try {
          return await instantiate(() => import('@cornerstonejs/codec-charls/decode'));
        } catch (jsError) {
          console.error('[codecs] Both Charls variants failed', { wasmError, jsError });
          throw jsError;
        }
      }
    })();
  }
  return charlsPromise;
}
async function loadLibJpeg(): Promise<AnyModule> {
  if (!libjpegPromise) {
    libjpegPromise = (async () => {
      try {
        return await instantiate(() => import('@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs'));
      } catch (wasmError) {
        console.warn('[codecs] WASM LibJPEG failed, trying JS fallback', wasmError);
        try {
          return await instantiate(() => import('@cornerstonejs/codec-libjpeg-turbo-8bit/decode'));
        } catch (jsError) {
          console.error('[codecs] Both LibJPEG variants failed', { wasmError, jsError });
          throw jsError;
        }
      }
    })();
  }
  return libjpegPromise;
}

export interface CodecResult {
  buffer: Uint8Array;
  width: number;
  height: number;
  bitsPerSample: number;
  componentCount: number;
  isSigned: boolean;
}

function toResult(decoder: any): CodecResult {
  const fi = decoder.getFrameInfo();
  const src = decoder.getDecodedBuffer();
  // Copy out of the WASM heap; the heap view is invalidated by the next decode.
  return {
    buffer: new Uint8Array(src.slice(0)),
    width: fi.width, height: fi.height,
    bitsPerSample: fi.bitsPerSample, componentCount: fi.componentCount, isSigned: !!fi.isSigned,
  };
}

/** JPEG 2000 (and HTJ2K, which OpenJPEG's HT build also handles). */
export async function decodeJ2K(encoded: Uint8Array): Promise<CodecResult> {
  const mod = await loadOpenJpeg();
  const decoder = new mod.J2KDecoder();
  try {
    const buf = decoder.getEncodedBuffer(encoded.length);
    buf.set(encoded);
    decoder.decode();
    return toResult(decoder);
  } catch (e) {
    throw new MedViewError({
      code: ErrorCode.PIXEL_DATA_INVALID,
      message: 'A JPEG 2000 compressed image could not be decoded.',
      detail: e instanceof Error ? e.message : String(e),
    });
  } finally { decoder.delete?.(); }
}

/** JPEG 2000 at a reduced decomposition level — used for fast low-resolution previews. */
export async function decodeJ2KSubResolution(encoded: Uint8Array, level: number): Promise<CodecResult> {
  const mod = await loadOpenJpeg();
  const decoder = new mod.J2KDecoder();
  try {
    const buf = decoder.getEncodedBuffer(encoded.length);
    buf.set(encoded);
    decoder.readHeader();
    const maxLevel = decoder.getNumDecompositions();
    decoder.decodeSubResolution(Math.min(level, maxLevel));
    return toResult(decoder);
  } finally { decoder.delete?.(); }
}

export async function decodeJLS(encoded: Uint8Array): Promise<CodecResult> {
  const mod = await loadCharls();
  const decoder = new mod.JpegLSDecoder();
  try {
    const buf = decoder.getEncodedBuffer(encoded.length);
    buf.set(encoded);
    decoder.decode();
    return toResult(decoder);
  } catch (e) {
    throw new MedViewError({
      code: ErrorCode.PIXEL_DATA_INVALID,
      message: 'A JPEG-LS compressed image could not be decoded.',
      detail: e instanceof Error ? e.message : String(e),
    });
  } finally { decoder.delete?.(); }
}

export async function decodeJPEG8(encoded: Uint8Array): Promise<CodecResult> {
  const mod = await loadLibJpeg();
  const decoder = new mod.JPEGDecoder();
  try {
    const buf = decoder.getEncodedBuffer(encoded.length);
    buf.set(encoded);
    decoder.decode();
    return toResult(decoder);
  } catch (e) {
    throw new MedViewError({
      code: ErrorCode.PIXEL_DATA_INVALID,
      message: 'A JPEG compressed image could not be decoded.',
      detail: e instanceof Error ? e.message : String(e),
    });
  } finally { decoder.delete?.(); }
}

export async function decodeJPEGLossless(
  encoded: Uint8Array, bitsAllocated: number,
): Promise<CodecResult> {
  const mod: any = await import('jpeg-lossless-decoder-js');
  const Decoder = (mod.default?.Decoder ?? mod.Decoder);
  const decoder = new Decoder();
  const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  const out: Uint8Array = decoder.decode(view, 0, encoded.byteLength, bitsAllocated <= 8 ? 1 : 2);
  return {
    buffer: new Uint8Array(out.buffer, out.byteOffset, out.byteLength),
    width: decoder.frame?.scanComponents ? 0 : 0, // filled by the caller from the header
    height: 0, bitsPerSample: bitsAllocated, componentCount: 1, isSigned: false,
  };
}
