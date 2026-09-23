/**
 * Phase 11 Enterprise Performance & Scalability Foundation Unit Tests
 */

import { EngineContext } from '../core/EngineContext';
import { RenderingScheduler } from '../performance/RenderingScheduler';
import { FrameScheduler } from '../performance/FrameScheduler';
import { StreamingManager } from '../performance/StreamingManager';
import { PrefetchManager } from '../performance/PrefetchManager';
import { CacheHierarchyManager } from '../performance/CacheHierarchyManager';
import { GPUMemoryManager } from '../performance/GPUMemoryManager';
import { BackgroundLoader } from '../performance/BackgroundLoader';
import { RemoteRenderingManager } from '../performance/RemoteRenderingManager';
import { PerformanceTelemetry } from '../performance/PerformanceTelemetry';
import { BenchmarkManager } from '../performance/BenchmarkManager';
import { PerformanceProfiler } from '../performance/PerformanceProfiler';
import { EngineEvents } from '../types/events';

export async function runPerformanceUnitTests(): Promise<{ passed: number; failed: number; logs: string[] }> {
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

    // 1. Test RenderingScheduler & FrameScheduler Events
    const renderingScheduler = new RenderingScheduler(context);
    renderingScheduler.scheduleRender('vp-1', 5);

    const frameScheduler = new FrameScheduler(context);
    let frameRenderedEmitted = false;
    context.eventBus.on(EngineEvents.FRAME_RENDERED, () => { frameRenderedEmitted = true; });

    frameScheduler.recordFrame('vp-1');
    assert(frameRenderedEmitted === true, 'FrameScheduler should emit FRAME_RENDERED event');

    // 2. Test StreamingManager Progressive Streaming
    const streamingManager = new StreamingManager(context);
    let streamStartedEmitted = false;
    context.eventBus.on(EngineEvents.STREAM_STARTED, () => { streamStartedEmitted = true; });

    await streamingManager.startProgressiveStream('vol-ct-001');
    assert(streamStartedEmitted === true, 'StreamingManager should emit STREAM_STARTED event');

    // 3. Test PrefetchManager Predictive Loading
    const prefetchManager = new PrefetchManager(context);
    prefetchManager.prefetchAdjacentSlices(50, 200, 5);

    // 4. Test CacheHierarchyManager Multi-Level Cache Hits/Misses
    const cacheManager = new CacheHierarchyManager(context);
    let cacheMissEmitted = false;
    let cacheHitEmitted = false;

    context.eventBus.on(EngineEvents.CACHE_MISS, () => { cacheMissEmitted = true; });
    context.eventBus.on(EngineEvents.CACHE_HIT, () => { cacheHitEmitted = true; });

    cacheManager.get('non-existent-key');
    assert(cacheMissEmitted === true, 'CacheHierarchyManager should emit CACHE_MISS for missing keys');

    cacheManager.set('test-key', { data: 'slice-data' });
    const cachedItem = cacheManager.get('test-key');
    assert(cachedItem !== undefined && cacheHitEmitted === true, 'CacheHierarchyManager should store and emit CACHE_HIT');

    // 5. Test GPUMemoryManager VRAM Allocations & Warnings
    const gpuMemManager = new GPUMemoryManager(context, 100);
    let gpuWarningEmitted = false;
    context.eventBus.on(EngineEvents.GPU_MEMORY_WARNING, () => { gpuWarningEmitted = true; });

    const allocSuccess = gpuMemManager.allocateTexture(50);
    assert(allocSuccess === true, 'GPUMemoryManager should allocate VRAM');

    const allocFail = gpuMemManager.allocateTexture(60);
    assert(allocFail === false && gpuWarningEmitted === true, 'GPUMemoryManager should block over-allocation and emit GPU_MEMORY_WARNING');

    // 6. Test BackgroundLoader Async Task Dispatching
    const backgroundLoader = new BackgroundLoader(context);
    let bgTaskEmitted = false;
    context.eventBus.on(EngineEvents.BACKGROUND_TASK_STARTED, () => { bgTaskEmitted = true; });

    backgroundLoader.enqueueTask('thumbnail-gen', async () => {});
    assert(bgTaskEmitted === true, 'BackgroundLoader should dispatch non-blocking task and emit BACKGROUND_TASK_STARTED');

    // 7. Test RemoteRenderingManager & Telemetry & BenchmarkManager
    const remoteManager = new RemoteRenderingManager(context);
    remoteManager.setRemoteEnabled(true);
    assert(remoteManager.isEnabled() === true, 'RemoteRenderingManager should toggle remote GPU rendering slot');

    const telemetry = new PerformanceTelemetry(context);
    const metrics = telemetry.reportTelemetry();
    assert(metrics !== undefined, 'PerformanceTelemetry should return telemetry metrics');

    const benchmarkManager = new BenchmarkManager(context);
    const benchmarkResult = await benchmarkManager.runFullBenchmark();
    assert(benchmarkResult.score > 0, 'BenchmarkManager should execute imaging engine benchmarks');

    const profiler = new PerformanceProfiler(context);
    profiler.startProfiling();
    const profileData = profiler.stopProfiling();
    assert(profileData !== undefined, 'PerformanceProfiler should capture profiling session data');

  } catch (err: any) {
    logs.push(`CRITICAL ERROR during Performance unit test execution: ${err.message}`);
    failed++;
  }

  return { passed, failed, logs };
}

if (typeof window !== 'undefined') {
  (window as any).__runPerformanceUnitTests = runPerformanceUnitTests;
}
