export class ProbabilityMaps {
  public static applySoftmax(logits: Float32Array, numClasses: number): Float32Array {
    const numVoxels = logits.length / numClasses;
    const probabilities = new Float32Array(logits.length);

    for (let i = 0; i < numVoxels; i++) {
      let maxLogit = -Infinity;
      for (let c = 0; c < numClasses; c++) {
        const v = logits[i * numClasses + c];
        if (v > maxLogit) maxLogit = v;
      }

      let expSum = 0;
      for (let c = 0; c < numClasses; c++) {
        const expVal = Math.exp(logits[i * numClasses + c] - maxLogit);
        probabilities[i * numClasses + c] = expVal;
        expSum += expVal;
      }

      for (let c = 0; c < numClasses; c++) {
        probabilities[i * numClasses + c] /= expSum || 1;
      }
    }
    return probabilities;
  }

  public static argmaxProbabilityMap(probabilities: Float32Array, numClasses: number): Uint8Array {
    const numVoxels = probabilities.length / numClasses;
    const labelMap = new Uint8Array(numVoxels);

    for (let i = 0; i < numVoxels; i++) {
      let maxProb = -1;
      let maxClass = 0;
      for (let c = 0; c < numClasses; c++) {
        const p = probabilities[i * numClasses + c];
        if (p > maxProb) {
          maxProb = p;
          maxClass = c;
        }
      }
      labelMap[i] = maxClass;
    }
    return labelMap;
  }
}
