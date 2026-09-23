import { RenderingEngine, getRenderingEngine, type Types } from '@cornerstonejs/core';
import { Logger, LogCategory } from '../../shared/Logger';
import { EngineRegistry } from '../../core/EngineRegistry';

class RenderingManagerImpl {
  private readonly ENGINE_ID = 'mpr-rendering-engine';

  async initialize(): Promise<void> {
    let re = getRenderingEngine(this.ENGINE_ID);
    if (!re) {
      re = new RenderingEngine(this.ENGINE_ID);
      Logger.info(LogCategory.RENDER, `[RenderingManager] Initialized RenderingEngine: ${this.ENGINE_ID}`);
    }
    EngineRegistry.register({
      id: this.ENGINE_ID,
      initialize: async () => {},
      destroy: () => this.destroy(),
    });
  }

  getEngine(): Types.IRenderingEngine | undefined {
    return getRenderingEngine(this.ENGINE_ID);
  }

  enableElement(viewportInput: Types.PublicViewportInput) {
    const re = this.getEngine();
    if (re) {
      re.enableElement(viewportInput);
      Logger.debug(LogCategory.RENDER, `[RenderingManager] Enabled element for viewport: ${viewportInput.viewportId}`);
    }
  }

  disableElement(viewportId: string) {
    const re = this.getEngine();
    if (re) {
      try {
        re.disableElement(viewportId);
        Logger.debug(LogCategory.RENDER, `[RenderingManager] Disabled element for viewport: ${viewportId}`);
      } catch (e) {
        Logger.warn(LogCategory.RENDER, `[RenderingManager] Error disabling element (likely React strict mode): ${viewportId}`);
      }
    }
  }

  resize() {
    const re = this.getEngine();
    if (re) re.resize(true, false);
  }

  render() {
    const re = this.getEngine();
    if (re) re.render();
  }

  destroy() {
    const re = this.getEngine();
    if (re) {
      re.destroy();
      Logger.info(LogCategory.RENDER, `[RenderingManager] Destroyed RenderingEngine: ${this.ENGINE_ID}`);
    }
    EngineRegistry.remove(this.ENGINE_ID);
  }
}

export const RenderingManager = new RenderingManagerImpl();
