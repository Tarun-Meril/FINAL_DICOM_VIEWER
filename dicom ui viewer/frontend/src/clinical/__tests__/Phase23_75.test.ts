import { Vector3 } from '../../3d/math/Vector3';
import { ModelRegistry } from '../ai/models/ModelRegistry';
import { IntensityNormalization, PatchGenerator } from '../ai/preprocessing/IntensityNormalization';
import { ProbabilityMaps } from '../ai/postprocessing/ProbabilityMaps';
import { DiceScore, IoU, AccuracyMetricsCalculator } from '../ai/metrics/DiceScore';
import { GPUResourceManager } from '../ai/gpu/GPUResourceManager';
import { AIResultCache, PredictionValidator } from '../ai/cache/AIResultCache';
import { InferencePipeline, AIOrchestrator } from '../ai/core/AIOrchestrator';
import { EnterpriseClinicalFacade } from '../index';

function assert(condition: boolean, msg = 'Assertion failed') {
  if (!condition) throw new Error(msg);
}

console.log('\n--- [TEST SUITE] Phase 23.75 Enterprise AI Data Pipeline & Model Infrastructure ---');

// 1. Model Registry & Metadata Test
const registry = new ModelRegistry();
const monaiModel = registry.getModel('monai-organ-seg-v1');
assert(monaiModel !== undefined && monaiModel.framework === 'MONAI', 'ModelRegistry MONAI model retrieval failed');
assert(registry.listModels().length === 2, 'ModelRegistry model listing failed');
console.log('✓ Model Registry & Metadata test passed');

// 2. Preprocessing & Patch Generator Test
const rawScalarData = new Float32Array(64 * 64 * 64).fill(100);
const normalized = IntensityNormalization.normalizeMinMax(rawScalarData);
assert(normalized.length === 64 * 64 * 64 && normalized[0] >= 0 && normalized[0] <= 1, 'IntensityNormalization failed');

const patches = PatchGenerator.generateSlidingWindowPatches(normalized, new Vector3(64, 64, 64), new Vector3(32, 32, 32), new Vector3(32, 32, 32));
assert(patches.length > 0, 'PatchGenerator 3D sliding window patch generation failed');
console.log('✓ Volume Preprocessing & 3D Patch Generator test passed');

// 3. Post-Processing & Softmax/Argmax Test
const logits = new Float32Array([1.0, 3.0, 2.5, 0.5]);
const probs = ProbabilityMaps.applySoftmax(logits, 2);
assert(probs.length === 4, 'ProbabilityMaps softmax calculation failed');
const labels = ProbabilityMaps.argmaxProbabilityMap(probs, 2);
assert(labels[0] === 1 && labels[1] === 0, 'ProbabilityMaps argmax calculation failed');
console.log('✓ Post-Processing & Softmax/Argmax Probability Maps test passed');

// 4. Accuracy Metrics Suite (Dice, IoU, Precision, Recall) Test
const maskA = new Uint8Array([1, 1, 0, 0]);
const maskB = new Uint8Array([1, 0, 1, 0]);
const dice = DiceScore.computeDice(maskA, maskB);
assert(dice === 0.5, 'DiceScore calculation failed');
const iou = IoU.computeIoU(maskA, maskB);
assert(iou === 1 / 3, 'IoU score calculation failed');
const metrics = AccuracyMetricsCalculator.computeAll(maskA, maskB);
assert(metrics.diceScore === 0.5 && metrics.precision > 0, 'AccuracyMetricsCalculator failed');
console.log('✓ Accuracy Metrics Suite (Dice, IoU, Precision, Recall) test passed');

// 5. GPU Resource Manager VRAM Scheduler Test
const gpuMgr = new GPUResourceManager();
const allocated = gpuMgr.allocateVram('monai-model', 1024);
assert(allocated === true && gpuMgr.getAvailableVramMb() === 8192 - 1024, 'GPUResourceManager VRAM allocation failed');
gpuMgr.freeVram('monai-model');
assert(gpuMgr.getAvailableVramMb() === 8192, 'GPUResourceManager VRAM cleanup failed');
console.log('✓ GPU Resource Manager & VRAM Memory Scheduler test passed');

// 6. AI Result Cache & Prediction Validator Test
const cache = new AIResultCache();
cache.set('key-1', maskA);
assert(cache.get('key-1') === maskA, 'AIResultCache set/get failed');
assert(PredictionValidator.validateOutput(maskA, 4) === true, 'PredictionValidator failed');
console.log('✓ AI Result Cache & Prediction Validator test passed');

// 7. Inference Pipeline & AI Orchestrator Test
const orchestrator = new AIOrchestrator();
const dims = new Vector3(16, 16, 16);
const scalarInt16 = new Int16Array(16 * 16 * 16).fill(250);

orchestrator.runInference('monai-organ-seg-v1', scalarInt16, dims).then(res => {
  assert(res.modelId === 'monai-organ-seg-v1' && res.outputLabelMap.length === 16 * 16 * 16, 'AIOrchestrator runInference failed');
  console.log('✓ Master AI Orchestrator & Inference Pipeline test passed');
});

// 8. Enterprise Public Facade Integration Test
const facade = new EnterpriseClinicalFacade();
const modelMeta = facade.loadModel('monai-organ-seg-v1');
assert(modelMeta?.name === 'MONAI Multi-Organ 3D Segmentation', 'EnterpriseClinicalFacade loadModel failed');
const facadeMetrics = facade.getInferenceMetrics(maskA, maskB);
assert(facadeMetrics.diceScore === 0.5, 'EnterpriseClinicalFacade getInferenceMetrics failed');
console.log('✓ EnterpriseClinicalFacade Public API test passed');
