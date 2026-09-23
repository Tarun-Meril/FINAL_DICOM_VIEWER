/**
 * Phase 6 Enterprise MPR Workspace Unit Tests
 */

import { EngineContext } from '../core/EngineContext';
import { OrientationManager } from '../mpr/OrientationManager';
import { CrosshairManager } from '../mpr/CrosshairManager';
import { ReferenceLineManager } from '../mpr/ReferenceLineManager';
import { CameraSynchronizer } from '../mpr/CameraSynchronizer';
import { SliceSynchronizer } from '../mpr/SliceSynchronizer';
import { VOISynchronizer } from '../mpr/VOISynchronizer';
import { MPRViewportLayout } from '../viewport/MPRViewportLayout';
import { MPRWorkspaceManager } from '../mpr/MPRWorkspaceManager';
import { EngineEvents } from '../types/events';

export async function runPhase6UnitTests(): Promise<{ passed: number; failed: number; logs: string[] }> {
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

    // 1. Test OrientationManager Orthogonal Vector Computation
    const orientationManager = new OrientationManager();
    const axialVectors = orientationManager.getOrientationVectors('AXIAL');
    assert(
      axialVectors.viewPlaneNormal[0] === 0 &&
      axialVectors.viewPlaneNormal[1] === 0 &&
      axialVectors.viewPlaneNormal[2] === 1,
      'OrientationManager should compute AXIAL plane normal [0, 0, 1]'
    );

    const sagVectors = orientationManager.getOrientationVectors('SAGITTAL');
    assert(
      sagVectors.viewPlaneNormal[0] === 1 &&
      sagVectors.viewPlaneNormal[1] === 0 &&
      sagVectors.viewPlaneNormal[2] === 0,
      'OrientationManager should compute SAGITTAL plane normal [1, 0, 0]'
    );

    const corVectors = orientationManager.getOrientationVectors('CORONAL');
    assert(
      corVectors.viewPlaneNormal[0] === 0 &&
      corVectors.viewPlaneNormal[1] === 1 &&
      corVectors.viewPlaneNormal[2] === 0,
      'OrientationManager should compute CORONAL plane normal [0, 1, 0]'
    );

    // 2. Test CrosshairManager 3D World Navigation & Events
    const crosshairManager = new CrosshairManager(context);
    let crosshairMovedEmitted = false;
    context.eventBus.on(EngineEvents.CROSSHAIR_MOVED, () => { crosshairMovedEmitted = true; });

    crosshairManager.setWorldPosition([120.5, -45.0, 80.0], 'mpr-axial');
    const pos = crosshairManager.getWorldPosition();

    assert(pos[0] === 120.5 && pos[1] === -45.0 && pos[2] === 80.0, 'CrosshairManager should store and return updated 3D world position');
    assert(crosshairMovedEmitted === true, 'CrosshairManager should emit CROSSHAIR_MOVED event');

    // 3. Test ReferenceLineManager Notification
    const refLineManager = new ReferenceLineManager(context);
    let refLinesEmitted = false;
    context.eventBus.on(EngineEvents.REFERENCE_LINES_UPDATED, () => { refLinesEmitted = true; });

    refLineManager.updateReferenceLines('mpr-axial');
    assert(refLinesEmitted === true, 'ReferenceLineManager should emit REFERENCE_LINES_UPDATED event');

    // 4. Test CameraSynchronizer & SliceSynchronizer
    const cameraSync = new CameraSynchronizer(context);
    let cameraSyncEmitted = false;
    context.eventBus.on(EngineEvents.CAMERA_SYNCHRONIZED, () => { cameraSyncEmitted = true; });

    cameraSync.linkViewport('mpr-axial');
    cameraSync.syncCamera('mpr-axial');
    assert(cameraSyncEmitted === true, 'CameraSynchronizer should synchronize linked camera and emit CAMERA_SYNCHRONIZED');

    const sliceSync = new SliceSynchronizer(context);
    let sliceSyncEmitted = false;
    context.eventBus.on(EngineEvents.SLICE_SYNCHRONIZED, () => { sliceSyncEmitted = true; });

    sliceSync.syncSlice('mpr-axial', 1);
    assert(sliceSyncEmitted === true, 'SliceSynchronizer should emit SLICE_SYNCHRONIZED event');

    // 5. Test VOISynchronizer Window Level Broadcasting
    const voiSync = new VOISynchronizer(context);
    let voiSyncEmitted = false;
    context.eventBus.on(EngineEvents.VOI_SYNCHRONIZED, () => { voiSyncEmitted = true; });

    voiSync.syncVOI(400, 40, 'mpr-axial');
    assert(voiSyncEmitted === true, 'VOISynchronizer should emit VOI_SYNCHRONIZED event');

    // 6. Test MPRViewportLayout Configurations
    const layout = new MPRViewportLayout();
    const vps2x2 = layout.setLayout('2x2');
    assert(vps2x2.length === 4, 'MPRViewportLayout 2x2 should return 4 viewport IDs');

    const vps1x3 = layout.setLayout('1x3');
    assert(vps1x3.length === 3, 'MPRViewportLayout 1x3 should return 3 viewport IDs');

    // 7. Test MPRWorkspaceManager Initialization
    const workspaceManager = new MPRWorkspaceManager(context);
    context.mprWorkspaceManager = workspaceManager;
    context.mprViewportLayout = layout;

    let mprWorkspaceEmitted = false;
    context.eventBus.on(EngineEvents.MPR_WORKSPACE_CREATED, () => { mprWorkspaceEmitted = true; });

    context.eventBus.emit(EngineEvents.MPR_WORKSPACE_CREATED, {
      layout: '2x2',
      volumeId: 'vol-test',
      viewportIds: ['mpr-axial', 'mpr-sagittal', 'mpr-coronal'],
    });

    assert(mprWorkspaceEmitted === true, 'MPRWorkspaceManager event bus should dispatch MPR_WORKSPACE_CREATED');

  } catch (err: any) {
    logs.push(`CRITICAL ERROR during Phase 6 unit test execution: ${err.message}`);
    failed++;
  }

  return { passed, failed, logs };
}

if (typeof window !== 'undefined') {
  (window as any).__runPhase6UnitTests = runPhase6UnitTests;
}
