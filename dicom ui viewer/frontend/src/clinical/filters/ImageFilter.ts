export class ImageFilter {
  public static applySharpen(data: Int16Array, width: number, height: number): Int16Array {
    const result = new Int16Array(data.length);
    result.set(data);
    return result;
  }

  public static applySmooth(data: Int16Array, width: number, height: number): Int16Array {
    const result = new Int16Array(data.length);
    result.set(data);
    return result;
  }

  public static applyMedian(data: Int16Array, width: number, height: number): Int16Array {
    const result = new Int16Array(data.length);
    result.set(data);
    return result;
  }

  public static applyEdgeEnhance(data: Int16Array, width: number, height: number): Int16Array {
    const result = new Int16Array(data.length);
    result.set(data);
    return result;
  }
}

export class ResamplingPipeline {
  public static process(data: Int16Array, width: number, height: number, filter: 'sharpen' | 'smooth' | 'none' = 'none'): Int16Array {
    if (filter === 'sharpen') return ImageFilter.applySharpen(data, width, height);
    if (filter === 'smooth') return ImageFilter.applySmooth(data, width, height);
    return data;
  }
}
