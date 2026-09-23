/**
 * The published @cornerstonejs/dicom-image-loader bundle ships without type
 * declarations. Only the surface this application uses is declared, so a typo
 * in a call is still a compile error rather than an implicit `any`.
 */
declare module '@cornerstonejs/dicom-image-loader' {
  export const external: {
    cornerstone: unknown;
    dicomParser: unknown;
  };

  export function configure(options: {
    useWebWorkers?: boolean;
    decodeConfig?: {
      convertFloatPixelDataToInt?: boolean;
      use16BitDataType?: boolean;
    };
    beforeSend?: (xhr: XMLHttpRequest) => void;
    [key: string]: unknown;
  }): void;

  export const webWorkerManager: {
    initialize(options: {
      maxWebWorkers?: number;
      startWebWorkersOnDemand?: boolean;
      webWorkerPath?: string;
      webWorkerTaskPaths?: string[];
      taskConfiguration?: Record<string, unknown>;
      [key: string]: unknown;
    }): void;
    terminate(): void;
  };

  export const wadouri: {
    loadImage: (imageId: string, options?: unknown) => unknown;
    fileManager: {
      add: (file: File | Blob) => string;
      get: (index: number) => File | Blob | undefined;
      remove: (index: number) => void;
      purge: () => void;
    };
    dataSetCacheManager: {
      get: (uri: string) => unknown;
      purge: () => void;
    };
  };

  export const wadors: {
    loadImage: (imageId: string, options?: unknown) => unknown;
  };
}

declare module '*.worker.js?url' {
  const url: string;
  export default url;
}
