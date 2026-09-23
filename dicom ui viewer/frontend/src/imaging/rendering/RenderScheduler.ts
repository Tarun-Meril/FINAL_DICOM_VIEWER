import { CommandQueue, RenderCommandType, IRenderCommand } from './CommandQueue';
import { Logger, LogCategory } from '../shared/Logger';
import { getRenderingEngine, type Types } from '@cornerstonejs/core';

class RenderSchedulerImpl {
  private isRendering = false;
  private animationFrameId: number | null = null;
  private renderingEngineId = 'mpr-rendering-engine';

  start() {
    if (!this.isRendering) {
      this.isRendering = true;
      this.loop();
      Logger.info(LogCategory.RENDER, '[RenderScheduler] Started rendering loop');
    }
  }

  stop() {
    this.isRendering = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    Logger.info(LogCategory.RENDER, '[RenderScheduler] Stopped rendering loop');
  }

  queueRenderAll() {
    CommandQueue.enqueue({ type: RenderCommandType.RENDER_ALL });
    if (!this.isRendering) this.start();
  }

  queueRenderViewport(viewportId: string) {
    CommandQueue.enqueue({ type: RenderCommandType.RENDER_VIEWPORT, viewportId });
    if (!this.isRendering) this.start();
  }
  
  queueResize() {
    CommandQueue.enqueue({ type: RenderCommandType.RESIZE });
    if (!this.isRendering) this.start();
  }

  private loop = () => {
    if (!this.isRendering) return;

    if (CommandQueue.hasCommands()) {
      this.processQueue();
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private processQueue() {
    const re = getRenderingEngine(this.renderingEngineId);
    if (!re) {
      CommandQueue.clear();
      return;
    }

    const commandsToProcess: IRenderCommand[] = [];
    while (CommandQueue.hasCommands()) {
      const cmd = CommandQueue.dequeue();
      if (cmd) commandsToProcess.push(cmd);
    }

    let shouldRenderAll = false;
    const viewportsToRender = new Set<string>();
    let shouldResize = false;

    for (const cmd of commandsToProcess) {
      switch (cmd.type) {
        case RenderCommandType.RESIZE:
          shouldResize = true;
          break;
        case RenderCommandType.RENDER_ALL:
          shouldRenderAll = true;
          break;
        case RenderCommandType.RENDER_VIEWPORT:
          if (cmd.viewportId) viewportsToRender.add(cmd.viewportId);
          break;
      }
    }

    try {
      if (shouldResize) {
        re.resize(true, false);
      }

      if (shouldRenderAll) {
        let hasZeroSize = false;
        re.getViewports().forEach(vp => {
          if (vp.element && (vp.element.clientWidth === 0 || vp.element.clientHeight === 0)) {
            hasZeroSize = true;
          }
        });
        if (!hasZeroSize) {
          re.getViewports().forEach(vp => {
            try {
              if (vp.element && vp.element.clientWidth > 0 && vp.element.clientHeight > 0) {
                vp.render();
              }
            } catch (err) {
              Logger.warn(LogCategory.RENDER, `[RenderScheduler] Viewport ${vp.id} render error:`, err);
            }
          });
        } else {
          // Re-queue and wait for layout to settle
          setTimeout(() => this.queueRenderAll(), 50);
        }
      } else if (viewportsToRender.size > 0) {
        viewportsToRender.forEach(vpId => {
          const vp = re.getViewport(vpId);
          if (vp && vp.element && vp.element.clientWidth > 0 && vp.element.clientHeight > 0) {
            vp.render();
          } else if (vp && vp.element) {
            setTimeout(() => this.queueRenderViewport(vpId), 50);
          }
        });
      }
    } catch (e) {
      Logger.error(LogCategory.RENDER, '[RenderScheduler] Error during render processing', e);
    }
  }
}

export const RenderScheduler = new RenderSchedulerImpl();
