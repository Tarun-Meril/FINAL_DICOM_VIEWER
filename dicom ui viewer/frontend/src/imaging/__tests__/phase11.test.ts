/**
 * Phase 11 Enterprise Performance Optimization, Streaming & Enterprise Deployment Unit Tests
 */

import { EngineContext } from '../core/EngineContext';
import { ProgressiveStudyLoader } from '../streaming/ProgressiveStudyLoader';
import { ProgressiveSeriesLoader } from '../streaming/ProgressiveSeriesLoader';
import { AdaptiveStreamingManager } from '../streaming/AdaptiveStreamingManager';
import { AdaptiveRenderingManager } from '../rendering/AdaptiveRenderingManager';
import { LODManager } from '../rendering/LODManager';
import { MultiMonitorManager } from '../rendering/MultiMonitorManager';
import { DisplaySynchronizationManager } from '../rendering/DisplaySynchronizationManager';
import { OfflineCacheManager } from '../deployment/OfflineCacheManager';
import { DeploymentProfileManager } from '../deployment/DeploymentProfileManager';
import { StartupOptimizer } from '../deployment/StartupOptimizer';
import { HealthMonitor } from '../deployment/HealthMonitor';
import { EngineEvents } from '../types/events';

export async function runPhase11UnitTests(): Promise<{ passed: number; failed: number; logs: string[] }> {
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

    // 1. Test ProgressiveStudyLoader & ProgressiveSeriesLoader
    const progressiveLoader = new ProgressiveStudyLoader(context);
    const seriesLoader = new ProgressiveSeriesLoader(context);
    let sliceLoadedEmitted = false;
    context.eventBus.on(EngineEvents.PROGRESSIVE_SLICE_LOADED, () => { sliceLoadedEmitted = true; });

    await progressiveLoader.loadStudyProgressively('1.2.840.10001');
    seriesLoader.loadSeriesSlicesProgressively('1.2.840.20002', 500);
    assert(sliceLoadedEmitted === true, 'ProgressiveSeriesLoader should emit PROGRESSIVE_SLICE_LOADED');

    // 2. Test AdaptiveStreamingManager & AdaptiveRenderingManager
    const adaptiveStreaming = new AdaptiveStreamingManager(context);
    adaptiveStreaming.setQualityTier('HIGH');
    assert(adaptiveStreaming.getQualityTier() === 'HIGH', 'AdaptiveStreamingManager should switch quality tiers');

    const adaptiveRendering = new AdaptiveRenderingManager(context);
    adaptiveRendering.setInteractionState(true);
    assert(adaptiveRendering.getInteractionState() === true, 'AdaptiveRenderingManager should track viewport interaction state');

    // 3. Test LODManager Resolution Switching
    const lodManager = new LODManager(context);
    let lodChangedEmitted = false;
    context.eventBus.on(EngineEvents.LOD_CHANGED, () => { lodChangedEmitted = true; });

    lodManager.setLOD(1);
    assert(lodManager.getLOD() === 1 && lodChangedEmitted === true, 'LODManager should update LOD level and emit LOD_CHANGED');

    // 4. Test MultiMonitorManager & DisplaySynchronizationManager
    const monitorManager = new MultiMonitorManager(context);
    monitorManager.setMonitorCount(4);
    assert(monitorManager.getMonitorCount() === 4, 'MultiMonitorManager should store diagnostic monitor profile');

    const displaySync = new DisplaySynchronizationManager(context);
    let monitorSyncedEmitted = false;
    context.eventBus.on(EngineEvents.MONITOR_SYNCED, () => { monitorSyncedEmitted = true; });

    displaySync.syncDisplays();
    assert(monitorSyncedEmitted === true, 'DisplaySynchronizationManager should emit MONITOR_SYNCED');

    // 5. Test OfflineCacheManager & DeploymentProfileManager
    const offlineManager = new OfflineCacheManager(context);
    let offlineEmitted = false;
    context.eventBus.on(EngineEvents.OFFLINE_STATUS_CHANGED, () => { offlineEmitted = true; });

    offlineManager.setOfflineMode(true);
    assert(offlineManager.isOffline() === true && offlineEmitted === true, 'OfflineCacheManager should set offline mode and emit OFFLINE_STATUS_CHANGED');

    const profileManager = new DeploymentProfileManager(context);
    profileManager.setProfile('CLOUD');
    assert(profileManager.getProfile() === 'CLOUD', 'DeploymentProfileManager should toggle deployment profile');

    // 6. Test StartupOptimizer & HealthMonitor
    const startupOptimizer = new StartupOptimizer(context);
    await startupOptimizer.warmupEngine();

    const healthMonitor = new HealthMonitor(context);
    let healthPassedEmitted = false;
    context.eventBus.on(EngineEvents.HEALTH_CHECK_PASSED, () => { healthPassedEmitted = true; });

    const health = healthMonitor.checkHealth();
    assert(health.healthy === true && healthPassedEmitted === true, 'HealthMonitor should execute system health check and emit HEALTH_CHECK_PASSED');

  } catch (err: any) {
    logs.push(`CRITICAL ERROR during Phase 11 unit test execution: ${err.message}`);
    failed++;
  }

  return { passed, failed, logs };
}

if (typeof window !== 'undefined') {
  (window as any).__runPhase11UnitTests = runPhase11UnitTests;
}
