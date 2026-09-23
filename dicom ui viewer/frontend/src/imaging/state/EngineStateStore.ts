/**
 * Headless In-Memory State Store
 */

import { IEngineHeadlessState, IEngineStateStore } from '../types/contracts';

type StateListener = (state: Readonly<IEngineHeadlessState>) => void;

export class EngineStateStore implements IEngineStateStore {
  private state: IEngineHeadlessState = {
    initialized: false,
    activeViewportId: null,
    activeTool: 'Pan',
    loadedStudies: [],
    activeVolumes: [],
  };

  private listeners: Set<StateListener> = new Set();

  public getState(): Readonly<IEngineHeadlessState> {
    return Object.freeze({ ...this.state });
  }

  public updateState(partial: Partial<IEngineHeadlessState>): void {
    this.state = {
      ...this.state,
      ...partial,
    };
    const snapshot = Object.freeze({ ...this.state });
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('[EngineStateStore] Error executing state listener:', err);
      }
    });
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    // Immediately emit current state snapshot
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }
}
