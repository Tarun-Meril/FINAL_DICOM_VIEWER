# MedView PRO — Enterprise AI Data Pipeline & Model Infrastructure (Phase 23.75)

## Overview
Phase 23.75 establishes a model-agnostic Enterprise AI Data Pipeline and Model Execution Infrastructure under `frontend/src/clinical/ai/` supporting MONAI, ONNX Runtime, TensorFlow.js, and PyTorch deep learning models.

## Directory Architecture (`frontend/src/clinical/ai/`)

```
frontend/src/clinical/ai/
    cache/              # AIResultCache (LRU cache for inference label maps)
    core/               # AIEngine, AIOrchestrator (Master AI execution orchestrator)
    datasets/           # DatasetRegistry & DatasetMetadata (Training/validation clinical datasets)
    gpu/                # GPUResourceManager (VRAM allocation pool & model memory scheduler)
    inference/          # InferenceEngine, BatchInference, StreamingInference
    metrics/            # DiceScore, IoU, AccuracyMetricsCalculator (Dice Similarity, IoU, Precision, Recall)
    models/             # ModelRegistry & ModelMetadata (MONAI, ONNX, TF.js model loader & versioning)
    pipeline/           # InferencePipeline (End-to-End Preprocessing -> Inference -> Postprocessing -> Validation)
    postprocessing/     # ProbabilityMaps (Softmax & Argmax label map postprocessing)
    preprocessing/      # IntensityNormalization (Z-score & Min-Max HU normalization), PatchGenerator (3D sliding window patches)
    validation/         # PredictionValidator & QualityValidator (Tensor shape & completeness checks)
```

## Public API Usage
```typescript
const clinical = new EnterpriseClinicalFacade();

// 1. Retrieve Model Metadata from Model Registry
const modelInfo = clinical.loadModel('monai-organ-seg-v1');

// 2. Run Asynchronous Model Inference
const result = await clinical.runInference('monai-organ-seg-v1', scalarData, dims);
// returns { outputLabelMap: Uint8Array, executionTimeMs: 12.5ms, vramUsedMb: 512MB }

// 3. Compute Accuracy Metrics (Dice Similarity Coefficient & IoU)
const metrics = clinical.getInferenceMetrics(groundTruthMask, predictedMask);
// returns { diceScore: 0.92, iouScore: 0.86, precision: 0.94, recall: 0.91 }
```
