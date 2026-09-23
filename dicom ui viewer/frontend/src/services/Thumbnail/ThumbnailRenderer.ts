import * as cornerstoneCore from '@cornerstonejs/core';
import { ViewportConfig } from './WindowLevelStrategy';

export class ThumbnailRenderer {
  private engineId = 'medview-rendering-engine';
  private viewportId = 'ThumbnailViewport';
  private renderingEngine: cornerstoneCore.RenderingEngine | null = null;
  private container: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.style.width = '256px';
    this.container.style.height = '256px';
    this.container.style.opacity = '0.01';
    this.container.style.zIndex = '-9999';
    this.container.style.position = 'fixed';
    this.container.style.top = '0px';
    this.container.style.left = '0px';
    this.container.style.pointerEvents = 'none';
    document.body.appendChild(this.container);
  }

  private initEngine() {
    if (this.renderingEngine) return;
    
    // Reuse the host's medview-rendering-engine so we never allocate redundant WebGL contexts
    this.renderingEngine = (cornerstoneCore.getRenderingEngine(this.engineId) ||
      new cornerstoneCore.RenderingEngine(this.engineId)) as cornerstoneCore.RenderingEngine;
  }

  public async render(imageId: string, config: ViewportConfig): Promise<HTMLCanvasElement> {
    this.initEngine();
    
    if (!this.renderingEngine) {
      throw new Error('Rendering engine not initialized');
    }

    const viewportInput = {
      viewportId: this.viewportId,
      type: cornerstoneCore.Enums.ViewportType.STACK,
      element: this.container,
      defaultOptions: {
        background: <cornerstoneCore.Types.Point3>[0, 0, 0],
      },
    };

    this.renderingEngine.enableElement(viewportInput);
    const viewport = this.renderingEngine.getViewport(this.viewportId) as cornerstoneCore.Types.IStackViewport;

    try {
      await cornerstoneCore.imageLoader.loadAndCacheImage(imageId);
      await viewport.setStack([imageId]);
    } catch (e) {
      throw new Error(`Failed to load or setStack for image ${imageId}: ${e}`);
    }

    const properties: cornerstoneCore.Types.ViewportProperties = {};
    if (config.voi) {
      properties.voiRange = {
        lower: config.voi.windowCenter - config.voi.windowWidth / 2,
        upper: config.voi.windowCenter + config.voi.windowWidth / 2,
      };
    }
    if (config.invert !== undefined) {
      properties.invert = config.invert;
    }

    if (Object.keys(properties).length > 0) {
      viewport.setProperties(properties);
    }

    return new Promise((resolve, reject) => {
      let timeoutId: any;
      const onImageRendered = (evt: any) => {
        if (timeoutId) clearTimeout(timeoutId);
        this.container.removeEventListener(cornerstoneCore.Enums.Events.IMAGE_RENDERED, onImageRendered);
        const canvas = viewport.getCanvas();
        resolve(canvas);
      };
      
      // Setup timeout in case of failure
      timeoutId = setTimeout(() => {
        this.container.removeEventListener(cornerstoneCore.Enums.Events.IMAGE_RENDERED, onImageRendered);
        reject(new Error('Render timeout'));
      }, 5000);

      this.container.addEventListener(cornerstoneCore.Enums.Events.IMAGE_RENDERED, onImageRendered);
      
      // Trigger the render after listener is attached
      viewport.render();
    });
  }

  public destroy() {
    if (this.renderingEngine) {
      try {
        this.renderingEngine.disableElement(this.viewportId);
      } catch {
        // ignore
      }
      this.renderingEngine = null;
    }
    this.container.remove();
  }
}
