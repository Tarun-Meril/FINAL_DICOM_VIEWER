export interface ModelMetadata {
  modelId: string;
  name: string;
  version: string;
  framework: 'MONAI' | 'ONNX' | 'TensorFlow.js' | 'PyTorch';
  modality: 'CT' | 'MR' | 'DX' | 'PET';
  targetAnatomy: string;
  inputTensorShape: number[]; // e.g. [1, 1, 128, 128, 128]
  outputClasses: string[];
  performanceMetrics: { diceScore: number; iou: number };
}

export class ModelRegistry {
  private models = new Map<string, ModelMetadata>();

  constructor() {
    // Register baseline AI models metadata
    this.registerModel({
      modelId: 'monai-organ-seg-v1',
      name: 'MONAI Multi-Organ 3D Segmentation',
      version: '1.2.0',
      framework: 'MONAI',
      modality: 'CT',
      targetAnatomy: 'Abdomen',
      inputTensorShape: [1, 1, 96, 96, 96],
      outputClasses: ['Background', 'Liver', 'Kidney_L', 'Kidney_R', 'Spleen'],
      performanceMetrics: { diceScore: 0.92, iou: 0.86 }
    });

    this.registerModel({
      modelId: 'onnx-lung-nodule-v2',
      name: 'ONNX Pulmonary Nodule Detector',
      version: '2.0.1',
      framework: 'ONNX',
      modality: 'CT',
      targetAnatomy: 'Lungs',
      inputTensorShape: [1, 1, 64, 64, 64],
      outputClasses: ['Background', 'Nodule'],
      performanceMetrics: { diceScore: 0.88, iou: 0.81 }
    });
  }

  public registerModel(metadata: ModelMetadata): void {
    this.models.set(metadata.modelId, metadata);
  }

  public getModel(modelId: string): ModelMetadata | undefined {
    return this.models.get(modelId);
  }

  public listModels(): ModelMetadata[] {
    return Array.from(this.models.values());
  }
}
