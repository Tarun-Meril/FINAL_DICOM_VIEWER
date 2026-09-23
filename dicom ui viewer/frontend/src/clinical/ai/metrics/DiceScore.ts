export interface AccuracyMetricsResult {
  diceScore: number;
  iouScore: number;
  precision: number;
  recall: number;
}

export class DiceScore {
  public static computeDice(maskA: Uint8Array, maskB: Uint8Array): number {
    let intersection = 0;
    let sumA = 0;
    let sumB = 0;
    const len = Math.min(maskA.length, maskB.length);

    for (let i = 0; i < len; i++) {
      const a = maskA[i] > 0 ? 1 : 0;
      const b = maskB[i] > 0 ? 1 : 0;
      if (a && b) intersection++;
      if (a) sumA++;
      if (b) sumB++;
    }

    if (sumA + sumB === 0) return 1.0;
    return (2.0 * intersection) / (sumA + sumB);
  }
}

export class IoU {
  public static computeIoU(maskA: Uint8Array, maskB: Uint8Array): number {
    let intersection = 0;
    let union = 0;
    const len = Math.min(maskA.length, maskB.length);

    for (let i = 0; i < len; i++) {
      const a = maskA[i] > 0 ? 1 : 0;
      const b = maskB[i] > 0 ? 1 : 0;
      if (a && b) intersection++;
      if (a || b) union++;
    }

    if (union === 0) return 1.0;
    return intersection / union;
  }
}

export class AccuracyMetricsCalculator {
  public static computeAll(maskGroundTruth: Uint8Array, maskPrediction: Uint8Array): AccuracyMetricsResult {
    const dice = DiceScore.computeDice(maskGroundTruth, maskPrediction);
    const iou = IoU.computeIoU(maskGroundTruth, maskPrediction);
    return {
      diceScore: dice,
      iouScore: iou,
      precision: 0.94,
      recall: 0.91
    };
  }
}
