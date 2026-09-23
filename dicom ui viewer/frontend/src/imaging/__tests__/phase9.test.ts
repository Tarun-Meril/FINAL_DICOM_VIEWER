/**
 * Phase 9 Enterprise Registration, Fusion & Advanced Clinical Visualization Unit Tests
 */

import { EngineContext } from '../core/EngineContext';
import { RegistrationManager } from '../registration/RegistrationManager';
import { TransformManager } from '../registration/TransformManager';
import { LandmarkManager } from '../registration/LandmarkManager';
import { FusionManager } from '../fusion/FusionManager';
import { BlendModeManager } from '../fusion/BlendModeManager';
import { CPRManager } from '../cpr/CPRManager';
import { VesselTrackingManager } from '../vessel/VesselTrackingManager';
import { EngineEvents } from '../types/events';

export async function runPhase9UnitTests(): Promise<{ passed: number; failed: number; logs: string[] }> {
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

    // 1. Test TransformManager 4x4 Matrix Operations
    const transformManager = new TransformManager();
    const identity = transformManager.createIdentity();
    assert(identity.length === 16 && identity[0] === 1 && identity[15] === 1, 'TransformManager should create 16-element 4x4 identity matrix');

    // 2. Test RegistrationManager (Rigid & Affine) & Events
    const regManager = new RegistrationManager(context);
    context.registrationManager = regManager;

    let regCompletedEmitted = false;
    context.eventBus.on(EngineEvents.REGISTRATION_COMPLETED, () => { regCompletedEmitted = true; });

    const rigidTransform = regManager.registerVolumes('vol-ct-ref', 'vol-mr-mov', 'RIGID');
    assert(rigidTransform && rigidTransform.matrix.length === 16, 'RegistrationManager should compute 6-DOF Rigid registration matrix');
    assert(regCompletedEmitted === true, 'RegistrationManager should emit REGISTRATION_COMPLETED event');

    // 3. Test LandmarkManager Landmark Pairs
    const landmarkManager = new LandmarkManager(context);
    landmarkManager.addLandmarkPair({
      id: 'lm-1',
      referencePoint: [10, 20, 30],
      movingPoint: [15, 22, 30],
    });

    assert(landmarkManager.getLandmarkPairs().length === 1, 'LandmarkManager should store anatomical landmark pair');

    // 4. Test FusionManager (PET/CT Fusion) & Blend Modes
    const fusionManager = new FusionManager(context);
    context.fusionManager = fusionManager;

    let fusionCreatedEmitted = false;
    context.eventBus.on(EngineEvents.FUSION_CREATED, () => { fusionCreatedEmitted = true; });

    const fusionSession = fusionManager.createFusion('vol-ct-ref', 'vol-pet-overlay');
    assert(fusionSession && fusionSession.colorMap === 'PET-HotIron', 'FusionManager should create PET/CT multi-volume fusion session');
    assert(fusionCreatedEmitted === true, 'FusionManager should emit FUSION_CREATED event');

    const blendManager = new BlendModeManager(context);
    blendManager.setBlendMode('MAXIMUM_INTENSITY');
    assert(blendManager.getBlendMode() === 'MAXIMUM_INTENSITY', 'BlendModeManager should update blend mode');

    // 5. Test CPRManager (Curved Planar Reformation)
    const cprManager = new CPRManager(context);
    context.cprManager = cprManager;

    let cprCreatedEmitted = false;
    context.eventBus.on(EngineEvents.CPR_CREATED, () => { cprCreatedEmitted = true; });

    const cprPath = cprManager.generateCPR('vol-ct-ref', [[0, 0, 0], [10, 10, 5], [20, 25, 10]]);
    assert(cprPath && cprPath.controlPoints.length >= 3, 'CPRManager should interpolate control points and generate CPR path');
    assert(cprCreatedEmitted === true, 'CPRManager should emit CPR_CREATED event');

    // 6. Test VesselTrackingManager (Lumen Centerline Extraction)
    const vesselManager = new VesselTrackingManager(context);
    context.vesselTrackingManager = vesselManager;

    let vesselEmitted = false;
    context.eventBus.on(EngineEvents.VESSEL_TRACKING_COMPLETED, () => { vesselEmitted = true; });

    const vesselCenterline = vesselManager.trackVessel('vol-ct-ref', [50, 50, 10]);
    assert(vesselCenterline && vesselCenterline.points.length === 20, 'VesselTrackingManager should extract vascular centerline points');
    assert(vesselEmitted === true, 'VesselTrackingManager should emit VESSEL_TRACKING_COMPLETED event');

  } catch (err: any) {
    logs.push(`CRITICAL ERROR during Phase 9 unit test execution: ${err.message}`);
    failed++;
  }

  return { passed, failed, logs };
}

if (typeof window !== 'undefined') {
  (window as any).__runPhase9UnitTests = runPhase9UnitTests;
}
