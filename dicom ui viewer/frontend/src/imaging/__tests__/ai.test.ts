/**
 * Phase 10 Enterprise AI Platform Foundation Unit Tests
 */

import { EngineContext } from '../core/EngineContext';
import { AIPlatform } from '../ai/AIPlatform';
import { AIModelRegistry } from '../ai/AIModelRegistry';
import { AIModelManager } from '../ai/AIModelManager';
import { InferencePipeline } from '../ai/InferencePipeline';
import { AIJobManager } from '../ai/AIJobManager';
import { GPUResourceManager } from '../ai/GPUResourceManager';
import { ModelCacheManager } from '../ai/ModelCacheManager';
import { AIResultRepository } from '../ai/AIResultRepository';
import { EngineEvents } from '../types/events';

export async function runAIPlatformUnitTests(): Promise<{ passed: number; failed: number; logs: string[] }> {
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

    // 1. Test AIModelRegistry Registration & Metadata Storage
    const registry = new AIModelRegistry(context);
    context.aiModelRegistry = registry;

    let modelRegisteredEmitted = false;
    context.eventBus.on(EngineEvents.MODEL_REGISTERED, () => { modelRegisteredEmitted = true; });

    registry.registerModel({
      modelId: 'monai-lung-nodule-seg',
      name: 'MONAI LIDC Lung Nodule Segmentation',
      version: '1.2.0',
      taskType: 'SEGMENTATION',
      inputFormat: 'NIFTI_3D',
      outputFormat: 'LABELMAP_3D',
      gpuMemoryMB: 1024,
      cpuCores: 4,
      supportedModalities: ['CT'],
      confidenceThreshold: 0.85,
      status: 'REGISTERED',
    });

    const modelMeta = registry.getModel('monai-lung-nodule-seg');
    assert(modelMeta !== undefined && modelMeta.name.includes('MONAI'), 'AIModelRegistry should store registered model metadata');
    assert(modelRegisteredEmitted === true, 'AIModelRegistry should emit MODEL_REGISTERED event');

    // 2. Test GPUResourceManager Allocation & VRAM Limits
    const gpuManager = new GPUResourceManager(context, 4096);
    context.gpuResourceManager = gpuManager;

    const allocated = gpuManager.allocateMemory(1024);
    assert(allocated === true && gpuManager.getAvailableMemoryMB() === 3072, 'GPUResourceManager should allocate VRAM');

    // 3. Test ModelCacheManager Tensor Buffering
    const cacheManager = new ModelCacheManager();
    const dummyBuffer = new ArrayBuffer(256);
    cacheManager.cacheTensorBuffer('tensor-1', dummyBuffer);
    assert(cacheManager.getTensorBuffer('tensor-1')?.byteLength === 256, 'ModelCacheManager should store and retrieve tensor buffers');

    // 4. Test AIModelManager VRAM Lifecycle
    const modelManager = new AIModelManager(context);
    context.aiModelManager = modelManager;

    await modelManager.loadModel('monai-lung-nodule-seg');
    assert(modelManager.isModelLoaded('monai-lung-nodule-seg') === true, 'AIModelManager should load model into GPU VRAM');

    // 5. Test InferencePipeline Execution
    const pipeline = new InferencePipeline(context);
    const result = await pipeline.executePipeline('monai-lung-nodule-seg', 'vol-ct-001');
    assert(result && result.findings.length > 0, 'InferencePipeline should execute pre-processing, model inference, and post-processing');

    // 6. Test AIResultRepository & AIPlatform Integration
    const resultRepo = new AIResultRepository();
    context.aiResultRepository = resultRepo;
    resultRepo.saveResult('vol-ct-001', result);
    assert(resultRepo.getResult('vol-ct-001') !== undefined, 'AIResultRepository should store AI clinical findings');

    const jobManager = new AIJobManager(context);
    context.aiJobManager = jobManager;

    const platform = new AIPlatform(context);
    context.aiPlatform = platform;

    const job = await platform.runInference('monai-lung-nodule-seg', 'vol-ct-002');
    assert(job && (job.status === 'QUEUED' || job.status === 'RUNNING' || job.status === 'COMPLETED'), 'AIPlatform should schedule inference job');

  } catch (err: any) {
    logs.push(`CRITICAL ERROR during AI Platform unit test execution: ${err.message}`);
    failed++;
  }

  return { passed, failed, logs };
}

if (typeof window !== 'undefined') {
  (window as any).__runAIPlatformUnitTests = runAIPlatformUnitTests;
}
