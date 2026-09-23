/**
 * Strongly-Typed PubSub EventBus for Headless Imaging Engine
 */

import { IEventBus } from '../types/contracts';
import { EngineEvents } from '../types/events';

type CallbackFn = (payload: any) => void;

export class EventBus implements IEventBus {
  private listeners: Map<string, Set<CallbackFn>> = new Map();

  public on<T = any>(event: EngineEvents | string, callback: (payload: T) => void): () => void {
    const key = String(event);
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    const set = this.listeners.get(key)!;
    set.add(callback as CallbackFn);

    return () => {
      this.off(event, callback);
    };
  }

  public off<T = any>(event: EngineEvents | string, callback: (payload: T) => void): void {
    const key = String(event);
    const set = this.listeners.get(key);
    if (set) {
      set.delete(callback as CallbackFn);
      if (set.size === 0) {
        this.listeners.delete(key);
      }
    }
  }

  public emit<T = any>(event: EngineEvents | string, payload?: T): void {
    const key = String(event);
    const set = this.listeners.get(key);
    if (set) {
      // Execute callbacks safely catching internal subscriber exceptions
      set.forEach((cb) => {
        try {
          cb(payload);
        } catch (err) {
          console.error(`[EventBus] Error executing subscriber callback for event '${key}':`, err);
        }
      });
    }
  }

  public removeAllListeners(event?: EngineEvents | string): void {
    if (event) {
      this.listeners.delete(String(event));
    } else {
      this.listeners.clear();
    }
  }
}
