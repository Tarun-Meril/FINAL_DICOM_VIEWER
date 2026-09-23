/**
 * ClinicalSessionManager Subsystem
 * Tracks active clinical tools, tool interaction history, and undo/redo stacks
 */

import { IClinicalSessionManager, IEngineContext } from '../types/contracts';
import { EngineEvents } from '../types/events';

export class ClinicalSessionManager implements IClinicalSessionManager {
  private engineContext: IEngineContext;
  private activeTool: string = 'Wwwc';
  private undoStack: any[] = [];
  private redoStack: any[] = [];

  constructor(context: IEngineContext) {
    this.engineContext = context;
  }

  public setActiveTool(toolName: string): void {
    const prev = this.activeTool;
    this.activeTool = toolName;
    this.engineContext.stateStore.updateState({ activeTool: toolName });
    this.engineContext.logger.info('Clinical', `Active tool changed from "${prev}" to "${toolName}"`);

    this.engineContext.eventBus.emit(EngineEvents.TOOL_CHANGED, {
      activeTool: toolName,
      previousTool: prev,
    });
  }

  public getActiveTool(): string {
    return this.activeTool;
  }

  public undo(): void {
    if (this.undoStack.length > 0) {
      const action = this.undoStack.pop();
      this.redoStack.push(action);
      this.engineContext.logger.info('Clinical', `Executed undo action: ${action.name || 'Action'}`);
    }
  }

  public redo(): void {
    if (this.redoStack.length > 0) {
      const action = this.redoStack.pop();
      this.undoStack.push(action);
      this.engineContext.logger.info('Clinical', `Executed redo action: ${action.name || 'Action'}`);
    }
  }
}
