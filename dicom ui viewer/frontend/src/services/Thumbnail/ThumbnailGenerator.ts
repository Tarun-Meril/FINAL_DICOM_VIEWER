import { ThumbnailRenderer } from './ThumbnailRenderer';
import { ViewportConfig } from './WindowLevelStrategy';
import { CacheConfig } from './ThumbnailCache';

export class ThumbnailGenerator {
  private renderer: ThumbnailRenderer;

  constructor(renderer: ThumbnailRenderer) {
    this.renderer = renderer;
  }

  public async generate(imageId: string, viewportConfig: ViewportConfig, targetConfig: CacheConfig): Promise<Blob> {
    const rawCanvas = await this.renderer.render(imageId, viewportConfig);
    
    // Resize and encode
    const outCanvas = document.createElement('canvas');
    outCanvas.width = targetConfig.width;
    outCanvas.height = targetConfig.height;
    
    const ctx = outCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2d context for thumbnail generation');
    }

    ctx.drawImage(rawCanvas, 0, 0, targetConfig.width, targetConfig.height);

    return new Promise((resolve, reject) => {
      outCanvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to encode canvas to blob'));
          }
        },
        targetConfig.format || 'image/webp',
        targetConfig.quality || 0.8
      );
    });
  }
}
