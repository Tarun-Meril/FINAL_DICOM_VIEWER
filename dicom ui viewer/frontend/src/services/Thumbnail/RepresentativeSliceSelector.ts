export interface SeriesMetadata {
  modality?: string;
  numberOfInstances?: number;
  [key: string]: any;
}

export interface SliceSelectorStrategy {
  selectSlice(imageIds: string[], metadata?: SeriesMetadata): string | null;
}

export class MiddleSliceStrategy implements SliceSelectorStrategy {
  public selectSlice(imageIds: string[], metadata?: SeriesMetadata): string | null {
    if (!imageIds || imageIds.length === 0) return null;
    
    // For single frame or multi-frame if imageIds holds frames
    const index = Math.floor(imageIds.length / 2);
    return imageIds[index];
  }
}

export class RepresentativeSliceSelector {
  private strategy: SliceSelectorStrategy;

  constructor(strategy?: SliceSelectorStrategy) {
    this.strategy = strategy || new MiddleSliceStrategy();
  }

  public setStrategy(strategy: SliceSelectorStrategy) {
    this.strategy = strategy;
  }

  public select(imageIds: string[], metadata?: SeriesMetadata): string | null {
    return this.strategy.selectSlice(imageIds, metadata);
  }
}
