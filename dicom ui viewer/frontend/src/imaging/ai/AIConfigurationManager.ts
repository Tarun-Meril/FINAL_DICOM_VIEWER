/**
 * AIConfigurationManager Subsystem
 * Manages configuration for ONNX Runtime, TensorRT, OpenVINO, MONAI, and Triton backend endpoints
 */

export class AIConfigurationManager {
  private config: Record<string, any> = {
    maxConcurrentInferences: 2,
    defaultGpuMemoryLimitMB: 4096,
    backendEngine: 'ONNX_RUNTIME',
  };

  public get(key: string): any {
    return this.config[key];
  }

  public set(key: string, value: any): void {
    this.config[key] = value;
  }
}
