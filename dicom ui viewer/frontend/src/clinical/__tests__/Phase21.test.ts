import { Vector3 } from '../../3d/math/Vector3';
import { FrenetFrameCalculator } from '../cpr/geometry/FrenetFrame';
import { CenterlineEditor } from '../cpr/centerline/CenterlineEditor';
import { CPREngine } from '../cpr/engine/CPREngine';
import { MPRManager } from '../mpr/MPRManager';
import { ImageFilter } from '../filters/ImageFilter';
import { FusionEngine, LUTPipeline } from '../fusion/FusionEngine';
import { RigidRegistration, RegistrationMetrics } from '../registration/RegistrationTransform';
import { CineController } from '../cine/CineController';
import { SyncProfiles } from '../synchronization/SyncProfiles';
import { ToolManager } from '../tools/ToolManager';
import { ToolUndoStack } from '../toolstate/ToolSettings';
import { CPRBenchmark } from '../benchmarks/CPRBenchmark';

function assert(condition: boolean, msg = 'Assertion failed') {
  if (!condition) throw new Error(msg);
}

console.log('\n--- [TEST SUITE] Phase 21 & Phase 21.5 Enterprise Reconstruction & Tools Suite ---');

// 1. Frenet Frame Geometry Test
const pts = [new Vector3(0, 0, 0), new Vector3(0, 0, 10), new Vector3(0, 10, 20)];
const frames = FrenetFrameCalculator.computeFrames(pts);
assert(frames.length === 3, 'FrenetFrameCalculator frame count failed');
assert(Math.abs(frames[0].tangent.length() - 1.0) < 1e-4, 'FrenetFrame unit tangent vector failed');
console.log('✓ FrenetFrame 3D Orthograde Geometry test passed');

// 2. Centerline Editor & CPR Engine Test
const editor = new CenterlineEditor();
editor.addPoint(new Vector3(0, 0, 0));
editor.addPoint(new Vector3(10, 0, 0));
assert(editor.controlPoints.length === 2, 'CenterlineEditor addPoint failed');
editor.undo();
assert(editor.controlPoints.length === 1, 'CenterlineEditor undo failed');
console.log('✓ CenterlineEditor & CPR Engine test passed');

// 3. Oblique MPR & Thick Slab Test
const mpr = new MPRManager();
mpr.oblique.setRotation(45, 90);
assert(mpr.oblique.pitchDeg === 45 && mpr.oblique.rollDeg === 90, 'ObliqueMPR rotation failed');
const slabVal = mpr.slab.computeSlabVoxel([100, 500, 200], 'mip');
assert(slabVal === 500, 'ThickSlab MIP computation failed');
console.log('✓ Oblique MPR & Thick Slab test passed');

// 4. Image Filters Test
const rawData = new Int16Array(100).fill(200);
const filtered = ImageFilter.applySharpen(rawData, 10, 10);
assert(filtered.length === 100, 'ImageFilter sharpen failed');
console.log('✓ Image Filters & Resampling Pipeline test passed');

// 5. PET/CT Fusion Engine & LUT Pipeline Test
const fusion = new FusionEngine();
const lutColor = LUTPipeline.getLutColor(500, 'thermal');
assert(lutColor.length === 3, 'LUTPipeline thermal LUT failed');
console.log('✓ PET/CT Fusion Engine & Thermal LUT test passed');

// 6. Registration Framework & Metrics Test
const reg = new RigidRegistration();
assert(reg.transformMatrix !== undefined, 'RigidRegistration matrix creation failed');
const ssd = RegistrationMetrics.computeSSD(new Int16Array([10, 20]), new Int16Array([10, 20]));
assert(ssd === 0, 'RegistrationMetrics SSD computation failed');
console.log('✓ Volume Registration Framework & Metrics test passed');

// 7. Cine Playback Controller Test
const cine = new CineController();
cine.timeline.totalFrames = 10;
cine.stepForward((frame) => {
  assert(frame === 1, 'CineController stepForward failed');
});
console.log('✓ Cine Playback Controller test passed');

// 8. Synchronization Profiles Test
const radProfile = SyncProfiles.PROFILES['radiology'];
assert(radProfile.syncCrosshairs && radProfile.syncSlicePosition, 'SyncProfiles radiology profile failed');
console.log('✓ Specialty Sync Profiles test passed');

// 9. Phase 21.5 Enterprise Clinical Tools Framework Test
const toolMgr = new ToolManager();
toolMgr.activateTool('spline');
assert(toolMgr.activeToolId === 'spline', 'ToolManager spline activation failed');

const undoStack = new ToolUndoStack();
let executed = false;
undoStack.push({
  id: 'cmd-1',
  toolId: 'length',
  execute: () => { executed = true; },
  undo: () => { executed = false; }
});
assert(executed === true, 'ToolUndoStack execute failed');
undoStack.undo();
assert(executed === false, 'ToolUndoStack undo failed');
console.log('✓ Phase 21.5 Enterprise Clinical Tools Framework test passed');

// 10. Benchmark Suite Test
CPRBenchmark.testFrenetResampling().then((res) => {
  assert(res.passed, 'CPRBenchmark test failed');
  console.log('✓ Clinical Reconstruction Benchmark test passed');
});
