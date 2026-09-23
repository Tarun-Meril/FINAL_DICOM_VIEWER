export interface ToolActionCommand {
  id: string;
  toolId: string;
  execute(): void;
  undo(): void;
}

export class ToolUndoStack {
  private undoStack: ToolActionCommand[] = [];
  private redoStack: ToolActionCommand[] = [];

  public push(command: ToolActionCommand): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];
  }

  public undo(): void {
    const cmd = this.undoStack.pop();
    if (cmd) {
      cmd.undo();
      this.redoStack.push(cmd);
    }
  }

  public redo(): void {
    const cmd = this.redoStack.pop();
    if (cmd) {
      cmd.execute();
      this.undoStack.push(cmd);
    }
  }
}

export class SelectionState {
  public selectedAnnotationId: string | null = null;
  public selectedMeasurementId: string | null = null;
}

export class ToolSettings {
  public brushRadius = 5;
  public splineSmoothness = 0.5;
  public magicWandTolerance = 15;
}
