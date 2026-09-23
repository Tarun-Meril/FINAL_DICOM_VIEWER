import { EventBus, MPREvents } from './EventBus';
import { Logger, LogCategory } from '../../shared/Logger';

export enum WorkstationState {
  IDLE = 'IDLE',
  INITIALIZING = 'INITIALIZING',
  LOADING_METADATA = 'LOADING_METADATA',
  LOADING_VOLUME = 'LOADING_VOLUME',
  BUILDING_MPR = 'BUILDING_MPR',
  BUILDING_VR = 'BUILDING_VR',
  READY = 'READY',
  RENDERING = 'RENDERING',
  PAUSED = 'PAUSED',
  DISPOSING = 'DISPOSING',
  DESTROYED = 'DESTROYED',
}

class LifecycleServiceImpl {
  private currentState: WorkstationState = WorkstationState.IDLE;

  getState(): WorkstationState {
    return this.currentState;
  }

  setState(newState: WorkstationState) {
    if (this.currentState !== newState) {
      Logger.info(LogCategory.GENERAL, `[Lifecycle] State transition: ${this.currentState} -> ${newState}`);
      this.currentState = newState;
      EventBus.publish(MPREvents.LIFECYCLE_STATE_CHANGED, this.currentState);
    }
  }

  isReady(): boolean {
    return this.currentState === WorkstationState.READY || this.currentState === WorkstationState.RENDERING;
  }
}

export const LifecycleService = new LifecycleServiceImpl();
