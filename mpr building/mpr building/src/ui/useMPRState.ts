import { useSyncExternalStore } from 'react';
import type { MPRState, MPRStateManager } from '../core/state/MPRStateManager';

/** Subscribe a component to the central MPR state. */
export function useMPRState(manager: MPRStateManager): MPRState {
  return useSyncExternalStore(
    (cb) => manager.subscribe(cb),
    () => manager.getState(),
    () => manager.getState(),
  );
}
