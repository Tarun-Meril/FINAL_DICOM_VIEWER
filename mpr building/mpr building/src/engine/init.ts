/**
 * Rendering engine bootstrap.
 *
 * ONE medical imaging engine is used for the whole application: Cornerstone3D.
 * MPR is built on its orthographic VolumeViewport, which performs the reslice
 * on the GPU from a single shared volume texture. There is no second renderer
 * and no per-plane copy of the data.
 */

import * as cornerstoneCore from '@cornerstonejs/core';
import {
  Enums as CoreEnums,
  init as coreInit,
  volumeLoader,
  imageLoader,
  setUseSharedArrayBuffer,
} from '@cornerstonejs/core';
import { init as toolsInit } from '@cornerstonejs/tools';
import * as dicomImageLoaderModule from '@cornerstonejs/dicom-image-loader';
const dicomImageLoader: any = (dicomImageLoaderModule as any).default || dicomImageLoaderModule;
import { cornerstoneStreamingImageVolumeLoader } from '@cornerstonejs/streaming-image-volume-loader';
import dicomParser from 'dicom-parser';

if (typeof window !== 'undefined') {
  (window as any).cornerstone = cornerstoneCore;
  (window as any).dicomParser = dicomParser;
  (window as any).cornerstoneDICOMImageLoader = dicomImageLoader;
}
// Vite resolves this to a served asset URL; the decoder workers are loaded
// from it so JPEG / JPEG-LS / JPEG 2000 decoding never blocks the UI thread.
import decodeWorkerUrl from '@cornerstonejs/dicom-image-loader/dist/index.worker.bundle.min.worker.js?url';
import { installMetadataProvider } from './metadataProvider';

let initialised = false;
let initialisePromise: Promise<void> | null = null;
let usingWebWorkers = false;

export interface EngineCapabilities {
  readonly webgl2: boolean;
  readonly maxTextureSize: number;
  /** Largest 3D texture edge the GPU will accept. */
  readonly max3DTextureSize: number;
}

export function detectCapabilities(): EngineCapabilities {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) return { webgl2: false, maxTextureSize: 0, max3DTextureSize: 0 };
    return {
      webgl2: true,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      max3DTextureSize: gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) as number,
    };
  } catch {
    return { webgl2: false, maxTextureSize: 0, max3DTextureSize: 0 };
  }
}

export async function initialiseEngine(): Promise<void> {
  if (initialised) return;
  if (initialisePromise) return initialisePromise;

  initialisePromise = (async () => {
    await coreInit({
      rendering: {
        // 16-bit textures keep CT on the GPU in true Hounsfield units instead
        // of quantising to 8 bits, which would corrupt quantitative windowing
        // and make the HU readout meaningless.
        preferSizeOverAccuracy: false,
        useNorm16Texture: true,
      },
    } as never);

    // SharedArrayBuffer is only available on a cross-origin isolated page.
    // Deployments SHOULD send Cross-Origin-Opener-Policy: same-origin and
    // Cross-Origin-Embedder-Policy: require-corp (the dev and preview servers
    // in vite.config.ts already do) because it materially speeds up large
    // volume loads. AUTO keeps the viewer working when they are absent instead
    // of failing to build the volume at all.
    setUseSharedArrayBuffer(CoreEnums.SharedArrayBufferModes.AUTO);

    await toolsInit();

    dicomImageLoader.external.cornerstone = cornerstoneCore;
    dicomImageLoader.external.dicomParser = dicomParser;

    const maxWebWorkers = Math.max(
      1,
      Math.min(navigator.hardwareConcurrency ?? 4, 8),
    );

    dicomImageLoader.configure({
      useWebWorkers: true,
      decodeConfig: {
        convertFloatPixelDataToInt: false,
        use16BitDataType: true,
      },
    });

    try {
      dicomImageLoader.webWorkerManager.initialize({
        maxWebWorkers,
        startWebWorkersOnDemand: true,
        webWorkerPath: decodeWorkerUrl,
        taskConfiguration: {
          decodeTask: { initializeCodecsOnStartup: false },
        },
      });
      usingWebWorkers = true;
    } catch (error) {
      // Decoding on the main thread is slower but correct. The failure is
      // surfaced rather than hidden, because it affects responsiveness on
      // large studies.
      console.warn(
        '[MPR] decoder web workers unavailable; falling back to main-thread decoding.',
        error,
      );
      dicomImageLoader.configure({ useWebWorkers: false });
      usingWebWorkers = false;
    }

    imageLoader.registerImageLoader(
      'wadouri',
      dicomImageLoader.wadouri.loadImage as never,
    );
    imageLoader.registerImageLoader(
      'dicomfile',
      dicomImageLoader.wadouri.loadImage as never,
    );
    imageLoader.registerImageLoader(
      'wadors',
      dicomImageLoader.wadors.loadImage as never,
    );

    volumeLoader.registerUnknownVolumeLoader(
      cornerstoneStreamingImageVolumeLoader as never,
    );
    volumeLoader.registerVolumeLoader(
      'cornerstoneStreamingImageVolume',
      cornerstoneStreamingImageVolumeLoader as never,
    );

    installMetadataProvider();
    initialised = true;
  })();

  return initialisePromise;
}

export function isEngineInitialised(): boolean {
  return initialised;
}

export function isUsingWebWorkers(): boolean {
  return usingWebWorkers;
}
