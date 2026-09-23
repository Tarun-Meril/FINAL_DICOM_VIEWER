export enum RenderCommandType {
  RENDER_VIEWPORT = 'RENDER_VIEWPORT',
  RENDER_ALL = 'RENDER_ALL',
  RESET_CAMERA = 'RESET_CAMERA',
  SET_WINDOW_LEVEL = 'SET_WINDOW_LEVEL',
  JUMP_SLICE = 'JUMP_SLICE',
  APPLY_PRESET = 'APPLY_PRESET',
  RESIZE = 'RESIZE',
}

export interface IRenderCommand {
  type: RenderCommandType;
  viewportId?: string;
  payload?: any;
}

class CommandQueueImpl {
  private queue: IRenderCommand[] = [];

  enqueue(command: IRenderCommand) {
    // Avoid duplicate render commands for the same viewport
    if (command.type === RenderCommandType.RENDER_VIEWPORT) {
      const exists = this.queue.find(
        (c) => c.type === RenderCommandType.RENDER_VIEWPORT && c.viewportId === command.viewportId
      );
      if (exists) return;
    }
    
    // RENDER_ALL supersedes individual RENDER_VIEWPORT commands
    if (command.type === RenderCommandType.RENDER_ALL) {
      this.queue = this.queue.filter(c => c.type !== RenderCommandType.RENDER_VIEWPORT);
      const exists = this.queue.find(c => c.type === RenderCommandType.RENDER_ALL);
      if (exists) return;
    }

    this.queue.push(command);
  }

  dequeue(): IRenderCommand | undefined {
    return this.queue.shift();
  }

  hasCommands(): boolean {
    return this.queue.length > 0;
  }

  clear() {
    this.queue = [];
  }
}

export const CommandQueue = new CommandQueueImpl();
