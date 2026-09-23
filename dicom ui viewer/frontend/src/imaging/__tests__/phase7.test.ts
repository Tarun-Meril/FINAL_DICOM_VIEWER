/**
 * Phase 7 Enterprise 3D Volume Rendering Pipeline Unit Tests
 */

import { EngineContext } from '../core/EngineContext';
import { TransferFunctionManager } from '../volume/TransferFunctionManager';
import { RayCastingManager } from '../volume/RayCastingManager';
import { RenderingQualityManager } from '../volume/RenderingQualityManager';
import { ClippingPlaneManager } from '../volume/ClippingPlaneManager';
import { VolumeRenderingPresetManager } from '../volume/VolumeRenderingPresetManager';
import { Volume3DViewportController } from '../viewport/Volume3DViewportController';
import { EngineEvents } from '../types/events';

export async function runPhase7UnitTests(): Promise<{ passed: number; failed: number; logs: string[] }> {
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

    // 1. Test TransferFunctionManager Curves
    const tfManager = new TransferFunctionManager();
    const boneTf = tfManager.getTransferFunction('CT-Bone');
    assert(
      boneTf &&
      boneTf.name === 'CT-Bone' &&
      boneTf.scalarOpacity.length > 0 &&
      boneTf.colorTransfer.length > 0,
      'TransferFunctionManager should return scalar opacity and color transfer curves for CT-Bone'
    );

    // 2. Test RayCastingManager Quality Steps
    const rayManager = new RayCastingManager();
    const lowSample = rayManager.getSampleDistance('LOW');
    const ultraSample = rayManager.getSampleDistance('ULTRA');
    assert(lowSample > ultraSample, 'RayCastingManager sample distance for LOW quality should be larger than ULTRA quality');

    // 3. Test RenderingQualityManager Level Control
    const qualityManager = new RenderingQualityManager(context);
    let qualityEventEmitted = false;
    context.eventBus.on(EngineEvents.QUALITY_CHANGED, () => { qualityEventEmitted = true; });

    qualityManager.setQualityLevel('ULTRA');
    assert(qualityManager.getQualityLevel() === 'ULTRA', 'RenderingQualityManager level should update to ULTRA');
    assert(qualityEventEmitted === true, 'RenderingQualityManager setQualityLevel should emit QUALITY_CHANGED event');

    // 4. Test ClippingPlaneManager Bounds
    const clippingManager = new ClippingPlaneManager(context);
    let clippingEventEmitted = false;
    context.eventBus.on(EngineEvents.CLIPPING_CHANGED, () => { clippingEventEmitted = true; });

    clippingManager.setClippingPlanes([{ name: 'axial-clip', normal: [0, 0, 1], distance: 50.0 }]);
    assert(clippingManager.getClippingPlanes().length === 1, 'ClippingPlaneManager should store clipping plane');
    assert(clippingEventEmitted === true, 'ClippingPlaneManager setClippingPlanes should emit CLIPPING_CHANGED event');

    // 5. Test VolumeRenderingPresetManager Preset Lookup
    const presetManager = new VolumeRenderingPresetManager();
    const angioPreset = presetManager.getPreset('CT-Angio');
    assert(angioPreset !== undefined && angioPreset.name === 'CT-Angio', 'VolumeRenderingPresetManager should retrieve CT-Angio preset');

    // 6. Test Volume3DViewportController Initialization
    const vrController = new Volume3DViewportController('vp-3d-test', 'container-3d', context);
    assert(vrController.viewportId === 'vp-3d-test', 'Volume3DViewportController should initialize with correct viewportId');

  } catch (err: any) {
    logs.push(`CRITICAL ERROR during Phase 7 unit test execution: ${err.message}`);
    failed++;
  }

  return { passed, failed, logs };
}

if (typeof window !== 'undefined') {
  (window as any).__runPhase7UnitTests = runPhase7UnitTests;
}
