export class ReconstructionWorker {
  public static async executeTask(data: Int16Array, taskType: string): Promise<Int16Array> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(data), 5);
    });
  }
}

export class CPRWorker {
  public static async resampleAsync(volumeData: Int16Array): Promise<Int16Array> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(volumeData), 10);
    });
  }
}

export class RegistrationWorker {
  public static async registerAsync(volume1: Int16Array, volume2: Int16Array): Promise<Float32Array> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(new Float32Array(16)), 15);
    });
  }
}
