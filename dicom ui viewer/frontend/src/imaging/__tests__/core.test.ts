/**
 * Phase 1 Headless Core Foundation Unit Tests
 */

import { EventBus } from '../core/EventBus';
import { EngineLogger } from '../core/EngineLogger';
import { PerformanceMonitor } from '../core/PerformanceMonitor';
import { CommandBus } from '../core/CommandBus';
import { EngineStateStore } from '../state/EngineStateStore';
import { EngineContext } from '../core/EngineContext';
import { ImagingEngine } from '../api/ImagingEngine';
import { EngineEvents } from '../types/events';

export function runCoreFoundationUnitTests(): { passed: number; failed: number; logs: string[] } {
  const logs: string[] = [];
  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, testName: string) => {
    if (condition) {
      passed++;
      logs.push(`✅ PASS: ${testName}`);
    } else {
      failed++;
      logs.push(`❌ FAIL: ${testName}`);
    }
  };

  try {
    // 1. Test EventBus
    const bus = new EventBus();
    let eventReceived = false;
    let receivedPayload: any = null;

    const unsubscribe = bus.on(EngineEvents.ENGINE_READY, (payload: any) => {
      eventReceived = true;
      receivedPayload = payload;
    });

    bus.emit(EngineEvents.ENGINE_READY, { test: 123 });
    assert(eventReceived === true && receivedPayload?.test === 123, 'EventBus should emit and deliver typed event payloads');

    unsubscribe();
    eventReceived = false;
    bus.emit(EngineEvents.ENGINE_READY, { test: 456 });
    assert(eventReceived === false, 'EventBus unsubscribe function should detach event listener');

    // 2. Test EngineStateStore
    const store = new EngineStateStore();
    assert(store.getState().initialized === false, 'EngineStateStore initial state should be uninitialized');

    let stateNotified = false;
    store.subscribe((state) => {
      if (state.initialized) stateNotified = true;
    });

    store.updateState({ initialized: true, activeTool: 'Zoom' });
    assert(store.getState().initialized === true && store.getState().activeTool === 'Zoom', 'EngineStateStore should update state immutably');
    assert(stateNotified === true, 'EngineStateStore update should notify subscribers');

    // 3. Test CommandBus
    const ctx = new EngineContext(false);
    let commandExecuted = false;
    ctx.commandBus.registerCommand('TestCommand', (context, payload) => {
      commandExecuted = true;
      return payload.value * 2;
    });

    assert(ctx.commandBus.hasCommand('TestCommand') === true, 'CommandBus should register command handlers');

    ctx.commandBus.executeCommand('TestCommand', { value: 21 }).then((result) => {
      assert(commandExecuted === true && result === 42, 'CommandBus should execute registered command and return result');
    });

    // 4. Test PerformanceMonitor
    const perf = new PerformanceMonitor();
    perf.recordRenderTime(14.2);
    perf.updateFps(60);
    const metrics = perf.getMetrics();
    assert(metrics.lastRenderTimeMs === 14.2 && metrics.fps === 60, 'PerformanceMonitor should record render time and FPS metrics');

    // 5. Test ImagingEngine Facade
    ImagingEngine.initialize({ debug: false }).then(() => {
      assert(ImagingEngine.isInitialized() === true, 'ImagingEngine facade should report initialized state after boot');
      assert(ImagingEngine.getState().initialized === true, 'ImagingEngine state snapshot should match store state');
    });

  } catch (err: any) {
    logs.push(`CRITICAL ERROR during unit test execution: ${err.message}`);
    failed++;
  }

  return { passed, failed, logs };
}

// Auto-run when executed in standalone context
if (typeof window !== 'undefined') {
  (window as any).__runEngineCoreUnitTests = runCoreFoundationUnitTests;
}
