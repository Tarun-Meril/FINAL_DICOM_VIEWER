/**
 * MPR engine bootstrap.
 *
 * IMPORTANT — this module deliberately does NOT initialise Cornerstone.
 *
 * The host application owns engine setup in `src/initCornerstone.ts`, and that
 * setup is not generic: it registers a custom JPEG 2000 decode worker with
 * `{ overwrite: true }`, installs `wadoImageLoaderWithFallback` for the
 * wadouri / dicomfile / wadors / cornerstoneStreamingImageVolume schemes, and
 * configures the streaming volume loader.
 *
 * An earlier version of this file called `coreInit()`, `toolsInit()` and
 * `dicomImageLoader.init()` again when MPR opened. In Cornerstone v4 a second
 * `dicomImageLoader.init()` REPLACES the worker registration, which discarded
 * the host's JPEG 2000 decoder. Every image in a JPEG 2000 study (transfer
 * syntax 1.2.840.10008.1.2.4.90 — which is what this PACS sends) then failed to
 * decode and both the 2D viewer and MPR rendered flat grey.
 *
 * So MPR now only:
 *   1. waits for the host's initialisation to finish, and
 *   2. installs its own metadata provider, which is additive and safe.
 *
 * Nothing here touches the decoder, the image loaders or the volume loaders.
 */

import { installMetadataProvider } from './metadataProvider';

let initialised = false;
let initialisePromise: Promise<void> | null = null;

export interface EngineCapabilities {
  readonly webgl2: boolean;
  readonly maxTextureSize: number;
  /** Largest 3D texture edge the GPU will accept. */
  readonly max3DTextureSize: number;
}

let cachedCapabilities: EngineCapabilities | null = null;

export function detectCapabilities(): EngineCapabilities {
  if (cachedCapabilities) return cachedCapabilities;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) {
      cachedCapabilities = { webgl2: false, maxTextureSize: 0, max3DTextureSize: 0 };
      return cachedCapabilities;
    }
    cachedCapabilities = {
      webgl2: true,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      max3DTextureSize: gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) as number,
    };
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    return cachedCapabilities;
  } catch {
    cachedCapabilities = { webgl2: false, maxTextureSize: 0, max3DTextureSize: 0 };
    return cachedCapabilities;
  }
}

/**
 * Ensure the host engine is ready, then install the MPR metadata provider.
 *
 * `initCornerstone()` is idempotent-by-await here: the host calls it during
 * bootstrap, and awaiting it again resolves immediately once complete. On the
 * standalone /mpr route it is the call that performs the real setup.
 */
export async function initialiseEngine(): Promise<void> {
  if (initialised) return;
  if (initialisePromise) return initialisePromise;

  initialisePromise = (async () => {
    // Defer to the host's engine setup — decoder, loaders and tools included.
    const { initCornerstone } = await import('../../initCornerstone');
    await initCornerstone();

    // Additive only: a higher-priority provider that answers from geometry the
    // MPR pipeline has already validated. It does not displace the host's
    // provider for anything it does not recognise.
    installMetadataProvider();

    initialised = true;
  })();

  return initialisePromise;
}

export function isEngineInitialised(): boolean {
  return initialised;
}

/**
 * Retained for API compatibility with the standalone build. Worker strategy is
 * the host's decision now, so this reports what the host configured rather than
 * claiming ownership of it.
 */
export function isUsingWebWorkers(): boolean {
  return initialised;
}
