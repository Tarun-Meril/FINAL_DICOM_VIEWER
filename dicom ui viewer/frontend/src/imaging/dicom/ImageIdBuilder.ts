/**
 * ImageIdBuilder Utility for Cornerstone Compatible Scheme Generation
 */

export interface IImageIdOptions {
  scheme?: 'wadouri' | 'wadors' | 'dicomfile';
  baseUrl?: string;
  studyUid?: string;
  seriesUid?: string;
  sopUid?: string;
  frameIndex?: number;
  filePath?: string;
}

export class ImageIdBuilder {
  public static buildWadoUriImageId(baseUrl: string, sopUid: string): string {
    const cleanBase = baseUrl ? baseUrl.replace(/\/$/, '') : '';
    return `wadouri:${cleanBase}/api/instances/${sopUid}/file`;
  }

  public static buildWadoRsImageId(baseUrl: string, studyUid: string, seriesUid: string, sopUid: string, frameIndex: number = 0): string {
    const cleanBase = baseUrl ? baseUrl.replace(/\/$/, '') : '';
    const frameSuffix = frameIndex > 0 ? `/frames/${frameIndex + 1}` : '';
    return `wadors:${cleanBase}/studies/${studyUid}/series/${seriesUid}/instances/${sopUid}${frameSuffix}`;
  }

  public static buildDicomFileImageId(filePath: string): string {
    const cleanPath = filePath.replace(/\\/g, '/');
    return `dicomfile:${cleanPath}`;
  }

  public static buildImageId(options: IImageIdOptions): string {
    const scheme = options.scheme || 'wadouri';
    if (scheme === 'dicomfile' && options.filePath) {
      return ImageIdBuilder.buildDicomFileImageId(options.filePath);
    }

    if (scheme === 'wadors' && options.studyUid && options.seriesUid && options.sopUid) {
      return ImageIdBuilder.buildWadoRsImageId(
        options.baseUrl || '',
        options.studyUid,
        options.seriesUid,
        options.sopUid,
        options.frameIndex || 0
      );
    }

    return ImageIdBuilder.buildWadoUriImageId(options.baseUrl || '', options.sopUid || '');
  }
}
