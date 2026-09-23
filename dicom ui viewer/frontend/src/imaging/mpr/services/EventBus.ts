import { Logger, LogCategory } from '../../shared/Logger';

type EventCallback = (payload: any) => void;

class EventBusService {
  private subscribers: Map<string, EventCallback[]> = new Map();

  subscribe(event: string, callback: EventCallback): () => void {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, []);
    }
    this.subscribers.get(event)!.push(callback);

    return () => this.unsubscribe(event, callback);
  }

  unsubscribe(event: string, callback: EventCallback) {
    if (!this.subscribers.has(event)) return;
    const callbacks = this.subscribers.get(event)!.filter((cb) => cb !== callback);
    this.subscribers.set(event, callbacks);
  }

  publish(event: string, payload?: any) {
    if (this.subscribers.has(event)) {
      Logger.debug(LogCategory.GENERAL, `[EventBus] Publishing ${event}`);
      this.subscribers.get(event)!.forEach((callback) => {
        try {
          callback(payload);
        } catch (error) {
          Logger.error(LogCategory.GENERAL, `[EventBus] Error in subscriber for ${event}`, error);
        }
      });
    }
  }
}

export const EventBus = new EventBusService();

export enum MPREvents {
  LIFECYCLE_STATE_CHANGED = 'LIFECYCLE_STATE_CHANGED',
  VOLUME_LOADED = 'VOLUME_LOADED',
  CROSSHAIR_MOVED = 'CROSSHAIR_MOVED',
  CAMERA_MODIFIED = 'CAMERA_MODIFIED',
  VIEWPORTS_READY = 'VIEWPORTS_READY',
  PRESET_CHANGED = 'PRESET_CHANGED',
  VR_STATUS_CHANGED = 'VR_STATUS_CHANGED',
}
