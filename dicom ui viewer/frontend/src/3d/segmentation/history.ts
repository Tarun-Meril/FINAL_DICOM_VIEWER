import { deltaByteLength, type MaskDelta } from './types';
import { applyDelta } from './operations';

export interface HistoryEntry {
  readonly delta: MaskDelta;
  /** Which byte array the delta belongs to. */
  readonly target: 'labels' | 'visibility';
  readonly at: number;
}

/**
 * Bounded undo/redo stack (§12, §13). Deltas are stored rather than snapshots, so the
 * cost is proportional to the number of voxels actually changed, not to volume size.
 */
export class EditHistory {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private bytes = 0;

  constructor(
    private readonly maxEntries = 50,
    private readonly maxBytes = 256 * 1024 * 1024,
  ) {}

  private sizeOf(e: HistoryEntry): number { return deltaByteLength(e.delta); }

  push(entry: HistoryEntry): void {
    if (entry.delta.changed === 0) return;
    this.undoStack.push(entry);
    this.bytes += this.sizeOf(entry);
    for (const e of this.redoStack) this.bytes -= this.sizeOf(e);
    this.redoStack = [];
    // Never evict the entry just pushed: losing the newest step would make the very next
    // Undo silently do the wrong thing.
    while (this.undoStack.length > 1 && (this.undoStack.length > this.maxEntries || this.bytes > this.maxBytes)) {
      const dropped = this.undoStack.shift();
      if (!dropped) break;
      this.bytes -= this.sizeOf(dropped);
    }
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }

  undo(resolve: (target: HistoryEntry['target']) => Uint8Array): HistoryEntry | null {
    const e = this.undoStack.pop();
    if (!e) return null;
    applyDelta(resolve(e.target), e.delta, 'undo');
    this.redoStack.push(e);
    return e;
  }

  redo(resolve: (target: HistoryEntry['target']) => Uint8Array): HistoryEntry | null {
    const e = this.redoStack.pop();
    if (!e) return null;
    applyDelta(resolve(e.target), e.delta, 'redo');
    this.undoStack.push(e);
    return e;
  }

  clear(): void { this.undoStack = []; this.redoStack = []; this.bytes = 0; }

  labels(): { undo: string[]; redo: string[] } {
    return {
      undo: this.undoStack.map((e) => e.delta.label),
      redo: this.redoStack.map((e) => e.delta.label),
    };
  }

  byteUsage(): number { return this.bytes; }
}
