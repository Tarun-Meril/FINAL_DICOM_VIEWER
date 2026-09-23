/**
 * Phase 4 Native 2D Stack Rendering Unit Tests
 */

import { EngineContext } from '../core/EngineContext';
import { DisplaySet, Instance } from '../domain/entities/DicomEntities';
import { ViewportRegistry } from '../viewport/ViewportRegistry';
import { ViewportManager } from '../viewport/ViewportManager';
import { StackViewportController } from '../viewport/StackViewportController';
import { EngineEvents } from '../types/events';

export async function runPhase4UnitTests(): Promise<{ passed: number; failed: number; logs: string[] }> {
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
    const context = new EngineContext(false);

    // 1. Test ViewportRegistry
    const registry = new ViewportRegistry();
    const mockController = { viewportId: 'vp-1' } as any;
    registry.register('vp-1', mockController, 'container-vp-1');

    assert(registry.getController('vp-1') !== undefined, 'ViewportRegistry should register and retrieve viewport controller');
    assert(registry.getContainerId('vp-1') === 'container-vp-1', 'ViewportRegistry should track container ID');

    registry.unregister('vp-1');
    assert(registry.getController('vp-1') === undefined, 'ViewportRegistry unregister should remove viewport controller');

    // 2. Test StackViewportController State Management
    const controller = new StackViewportController('vp-test', 'container-test', context);
    const mockInst1 = new Instance({
      sopInstanceUid: 'sop-1',
      seriesInstanceUid: 'se-1',
      studyInstanceUid: 'st-1',
      instanceNumber: 1,
      windowCenter: 40,
      windowWidth: 400,
    });
    const mockInst2 = new Instance({
      sopInstanceUid: 'sop-2',
      seriesInstanceUid: 'se-1',
      studyInstanceUid: 'st-1',
      instanceNumber: 2,
      windowCenter: 40,
      windowWidth: 400,
    });

    const mockDisplaySet = new DisplaySet({
      displaySetInstanceUID: 'ds-test',
      seriesInstanceUid: 'se-1',
      studyInstanceUid: 'st-1',
      modality: 'CT',
      label: 'Series Test',
      isVolumeEligible: true,
      imageIds: ['wadouri:http://localhost:8000/api/instances/sop-1/file', 'wadouri:http://localhost:8000/api/instances/sop-2/file'],
      instances: [mockInst1, mockInst2],
    });

    const state = controller.getState();
    assert(state.viewportId === 'vp-test' && state.type === 'STACK', 'StackViewportController state should report STACK type');
    assert(controller.getTotalSlices() === 0, 'Unbound StackViewportController should have 0 total slices');

    // 3. Test ViewportManager Active Viewport Tracking
    const manager = new ViewportManager(context);
    context.viewportManager = manager;
    context.viewportRegistry = registry;

    manager.setActiveViewport('vp-active-test');
    assert(manager.getActiveViewportId() === 'vp-active-test', 'ViewportManager should manage active viewport selection');

    // 4. Test Viewport Event Telemetry
    let createdEmitted = false;
    let destroyedEmitted = false;

    context.eventBus.on(EngineEvents.VIEWPORT_CREATED, () => { createdEmitted = true; });
    context.eventBus.on(EngineEvents.VIEWPORT_DESTROYED, () => { destroyedEmitted = true; });

    context.eventBus.emit(EngineEvents.VIEWPORT_CREATED, { viewportId: 'vp-event-test', type: 'STACK' });
    context.eventBus.emit(EngineEvents.VIEWPORT_DESTROYED, { viewportId: 'vp-event-test' });

    assert(createdEmitted === true, 'EngineContext EventBus should dispatch VIEWPORT_CREATED');
    assert(destroyedEmitted === true, 'EngineContext EventBus should dispatch VIEWPORT_DESTROYED');

  } catch (err: any) {
    logs.push(`CRITICAL ERROR during Phase 4 unit test execution: ${err.message}`);
    failed++;
  }

  return { passed, failed, logs };
}

if (typeof window !== 'undefined') {
  (window as any).__runPhase4UnitTests = runPhase4UnitTests;
}
