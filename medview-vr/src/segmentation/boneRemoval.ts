/**
 * Bone extraction / suppression / removal workflow (§11).
 *
 * All four modes are non-destructive: they write to a label volume and to the
 * rendering-exclusion mask. The source volume is never altered.
 */
import type { VolumeData } from '@/volume/types';
import { LabelVolume } from './labelVolume';
import {
  thresholdSegment, filterConnectedComponents, applyLabelToVisibility, dilateLabel,
} from './operations';
import type { MaskDelta, LabelId } from './types';

export interface BoneExtractionOptions {
  /** Lower HU threshold for "dense". 150–350 HU is the usual working range for CT bone;
   *  the default is derived from the dataset histogram, never hard-coded as clinical truth. */
  readonly thresholdHU: number;
  /** Drop connected components smaller than this many voxels (clips, noise, calcification). */
  readonly minComponentVoxels?: number;
  /** Keep only the N largest components (e.g. 1 for "the skull"). 0 = keep all. */
  readonly keepLargest?: number;
  /** Grow the mask to catch partial-volume rim voxels before removal. */
  readonly dilateVoxels?: number;
  readonly withinVisible?: Uint8Array;
}

export interface BoneExtractionResult {
  readonly deltas: readonly MaskDelta[];
  readonly voxelCount: number;
  readonly componentCount: number;
  readonly keptComponents: number;
}

/** Produce a bone label without changing what is displayed. */
export function extractBone(
  volume: VolumeData, labels: LabelVolume, id: LabelId, opts: BoneExtractionOptions,
): BoneExtractionResult {
  const deltas: MaskDelta[] = [];
  deltas.push(thresholdSegment(volume, labels, id, {
    lower: opts.thresholdHU, upper: 32767, withinVisible: opts.withinVisible,
  }));

  const minVox = opts.minComponentVoxels ?? 0;
  const keepLargest = opts.keepLargest ?? 0;
  let componentCount = 0, keptComponents = 0;
  if (minVox > 0 || keepLargest > 0) {
    const { delta, components } = filterConnectedComponents(labels, id, (c, all) => {
      if (c.size < minVox) return false;
      if (keepLargest > 0) {
        const ranked = [...all].sort((a, b) => b.size - a.size).slice(0, keepLargest);
        return ranked.some((r) => r.componentId === c.componentId);
      }
      return true;
    });
    deltas.push(delta);
    componentCount = components.length;
    keptComponents = components.filter((c) => c.size >= minVox).length;
  }

  if (opts.dilateVoxels && opts.dilateVoxels > 0) {
    deltas.push(dilateLabel(labels, id, opts.dilateVoxels));
  }

  const counts = labels.countsByLabel();
  return { deltas, voxelCount: counts.get(id) ?? 0, componentCount, keptComponents };
}

/** Hide everything that carries the bone label (the CTA "bone removal" step). */
export function removeBone(visibility: Uint8Array, labels: LabelVolume, id: LabelId): MaskDelta {
  return applyLabelToVisibility(visibility, labels, id, 'erase');
}

/** Show only the bone label (the "bone only" view). */
export function keepBone(visibility: Uint8Array, labels: LabelVolume, id: LabelId): MaskDelta {
  return applyLabelToVisibility(visibility, labels, id, 'keep');
}

/**
 * Suggest a bone threshold from this dataset's own histogram rather than a fixed
 * number. Returns the HU at which the dense tail begins to separate from soft tissue.
 *
 * NOT a clinically validated threshold — a starting point for the operator (§8).
 */
export function suggestBoneThreshold(volume: VolumeData): { thresholdHU: number; rationale: string } {
  const { histogram, percentiles } = volume.statistics;
  const { counts, min, binWidth } = histogram;

  const bin = (hu: number) => Math.max(0, Math.min(counts.length - 1, Math.round((hu - min) / binWidth)));
  const smooth = (b: number): number => {
    let acc = 0, n = 0;
    for (let k = -2; k <= 2; k++) {
      const i = b + k;
      if (i < 0 || i >= counts.length) continue;
      acc += counts[i]; n++;
    }
    return n ? acc / n : 0;
  };

  // Walk up from 120 HU looking for the FIRST genuine valley: a local minimum whose
  // smoothed count rises again by a clear margin shortly afterwards. That is the boundary
  // between the soft-tissue tail and the start of bone. A plain "lowest bin in a window"
  // search is wrong here, because the histogram keeps falling well past the boundary and
  // reaches its true minimum between trabecular and cortical bone, far too high to use.
  // Never propose a threshold inside the soft-tissue range: below ~150 HU the same
  // attenuation covers acute haemorrhage, contrast and dense soft tissue.
  const FLOOR_HU = 150;
  const lo = bin(FLOOR_HU), hi = bin(700);
  const riseWindow = Math.max(1, Math.round(150 / binWidth));
  // Ignore bins that are essentially empty; in a sparse histogram every gap looks
  // like a valley.
  const floorCount = histogram.total * 2e-5;
  for (let b = lo + 1; b <= hi - 1; b++) {
    const here = smooth(b);
    if (here < floorCount) continue;
    if (here > smooth(b - 1) || here > smooth(b + 1)) continue;
    let peak = here;
    for (let k = b + 1; k <= Math.min(hi, b + riseWindow); k++) peak = Math.max(peak, smooth(k));
    if (peak >= here * 1.10) {
      const valley = min + b * binWidth;
      return {
        thresholdHU: Math.round(Math.max(FLOOR_HU, valley)),
        rationale: `The histogram has a local minimum at ${Math.round(valley)} HU with a ` +
          `${((peak / here - 1) * 100).toFixed(0)} % rise above it, which is where this dataset's ` +
          `soft-tissue tail ends and dense material begins.`,
      };
    }
  }

  // No clear valley: derive one from the dense tail instead, and say so.
  const p99 = percentiles.p99;
  const fallback = Math.round(Math.max(FLOOR_HU, Math.min(400, p99 * 0.35)));
  return {
    thresholdHU: fallback,
    rationale: `No clear separation between soft tissue and dense material was found in the ` +
      `histogram, so the threshold was derived from the dense tail instead ` +
      `(99th percentile ${Math.round(p99)} HU). Adjust it against the rendering.`,
  };
}
