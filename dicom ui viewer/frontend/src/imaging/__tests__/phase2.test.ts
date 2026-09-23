/**
 * Phase 2 Cornerstone Foundation Unit Tests
 */

import { EngineContext } from '../core/EngineContext';
import { CornerstoneBootstrap } from '../infrastructure/cornerstone/CornerstoneBootstrap';
import { RenderingEngineManager } from '../infrastructure/cornerstone/RenderingEngineManager';
import { addInstanceMetadata, getMetadataFromStore } from '../metadata/customMetaDataProvider';
import { EngineEvents } from '../types/events';

export async function runPhase2UnitTests(): Promise<{ passed: number; failed: number; logs: string[] }> {
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
    const bootstrap = new CornerstoneBootstrap(context);

    // 1. Test Metadata Provider Adapter
    addInstanceMetadata('test-image-1', {
      imagePositionPatient: [10, 20, 30],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      pixelSpacing: [0.5, 0.5],
      sliceThickness: 2.5,
      columns: 512,
      rows: 512,
    });

    const planeModule = getMetadataFromStore('imagePlaneModule', 'test-image-1');
    assert(
      planeModule &&
      planeModule.columns === 512 &&
      planeModule.sliceThickness === 2.5 &&
      planeModule.imagePositionPatient[2] === 30,
      'Metadata Adapter should store and return normalized imagePlaneModule'
    );

    // 2. Test Cornerstone Bootstrap & Event Flow
    let cornerstoneInitializedEmitted = false;
    let webWorkersReadyEmitted = false;
    let engineReadyEmitted = false;

    context.eventBus.on(EngineEvents.CORNERSTONE_INITIALIZED, () => { cornerstoneInitializedEmitted = true; });
    context.eventBus.on(EngineEvents.WEB_WORKERS_READY, () => { webWorkersReadyEmitted = true; });
    context.eventBus.on(EngineEvents.ENGINE_READY, () => { engineReadyEmitted = true; });

    await bootstrap.bootstrap({ maxWebWorkers: 2, debug: false });

    assert(bootstrap.isBootstrapped() === true, 'CornerstoneBootstrap should report bootstrapped state');
    assert(cornerstoneInitializedEmitted === true, 'Bootstrap should emit CORNERSTONE_INITIALIZED event');
    assert(webWorkersReadyEmitted === true, 'Bootstrap should emit WEB_WORKERS_READY event');
    assert(engineReadyEmitted === true, 'Bootstrap should emit ENGINE_READY event');

    // 3. Test Singleton RenderingEngineManager
    const reManager = new RenderingEngineManager(context);
    const engine1 = reManager.getRenderingEngine();
    const engine2 = reManager.getRenderingEngine();

    assert(engine1 !== null && engine1 === engine2, 'RenderingEngineManager should maintain a singleton RenderingEngine instance');
    assert(reManager.renderingEngineId === 'medview-rendering-engine', 'RenderingEngine ID should match medview-rendering-engine');

    // 4. Test Performance Metrics capture
    const metrics = context.performanceMonitor.getMetrics();
    assert(metrics.workerStartupTimeMs >= 0, 'PerformanceMonitor should record Web Worker startup time metric');
    assert(metrics.initTimeMs >= 0, 'PerformanceMonitor should record overall init time metric');

    // 5. Test Clean Shutdown
    let engineDestroyedEmitted = false;
    context.eventBus.on(EngineEvents.ENGINE_DESTROYED, () => { engineDestroyedEmitted = true; });

    await bootstrap.destroy();
    assert(bootstrap.isBootstrapped() === false, 'CornerstoneBootstrap should report un-bootstrapped state after destroy');
    assert(engineDestroyedEmitted === true, 'Bootstrap destroy should emit ENGINE_DESTROYED event');

  } catch (err: any) {
    logs.push(`CRITICAL ERROR during Phase 2 unit test execution: ${err.message}`);
    failed++;
  }

  return { passed, failed, logs };
}

if (typeof window !== 'undefined') {
  (window as any).__runPhase2UnitTests = runPhase2UnitTests;
}
