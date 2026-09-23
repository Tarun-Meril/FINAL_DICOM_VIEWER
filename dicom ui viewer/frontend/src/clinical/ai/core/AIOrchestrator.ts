import { Vector3 } from '../../../3d/math/Vector3';
import { ModelRegistry, ModelMetadata } from '../models/ModelRegistry';
import { IntensityNormalization, PatchGenerator } from '../preprocessing/IntensityNormalization';
import { ProbabilityMaps } from '../postprocessing/ProbabilityMaps';
import { AccuracyMetricsCalculator, AccuracyMetricsResult } from '../metrics/DiceScore';
import { GPUResourceManager } from '../gpu/GPUResourceManager';
import { AIResultCache } from '../cache/AIResultCache';
import { PredictionValidator } from '../cache/AIResultCache';

export interface InferenceRunResult {
  modelId: string;
  executionTimeMs: number;
  outputLabelMap: Uint8Array;
  vramUsedMb: number;
}

export class InferencePipeline {
  public static async execute(
    model: ModelMetadata,
    scalarData: Int16Array,
    dims: Vector3
  ): Promise<InferenceRunResult> {
    const start = performance.now();
    // 1. Intensity Normalization
    const floatData = new Float32Array(scalarData.length);
    for (let i = 0; i < scalarData.length; i++) floatData[i] = scalarData[i];
    const normalized = IntensityNormalization.normalizeMinMax(floatData);

    // 2. Mock model logits & Argmax LabelMap postprocessing
    const outputLabelMap = new Uint8Array(dims.x * dims.y * dims.z);
    for (let i = 0; i < outputLabelMap.length; i++) {
      if (normalized[i] > 0.6) outputLabelMap[i] = 1;
    }

    const duration = performance.now() - start;

    return {
      modelId: model.modelId,
      executionTimeMs: duration,
      outputLabelMap,
      vramUsedMb: 512
    };
  }
}

export class AIOrchestrator {
  public modelRegistry = new ModelRegistry();
  public gpuManager = new GPUResourceManager();
  public cache = new AIResultCache();

  public async runInference(modelId: string, scalarData: Int16Array, dims: Vector3): Promise<InferenceRunResult> {
    const model = this.modelRegistry.getModel(modelId);
    if (!model) throw new Error(`AI Model not registered: ${modelId}`);

    this.gpuManager.allocateVram(modelId, 512);
    const res = await InferencePipeline.execute(model, scalarData, dims);
    this.gpuManager.freeVram(modelId);
    return res;
  }
}
