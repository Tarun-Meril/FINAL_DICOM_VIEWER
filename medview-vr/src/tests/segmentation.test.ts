import { describe, it, expect } from 'vitest';
import { LabelVolume, VisibilityMask, applyVisibility } from '@/segmentation/labelVolume';
import {
  thresholdSegment, regionGrow, filterConnectedComponents, sculptBox, sculptPlane,
  sculptSphere, sculptPolygonPrism, applyLabelToVisibility, dilateLabel, applyDelta,
} from '@/segmentation/operations';
import { extractBone, removeBone, keepBone, suggestBoneThreshold } from '@/segmentation/boneRemoval';
import { EditHistory } from '@/segmentation/history';
import { rleEncode, rleDecode } from '@/segmentation/rle';
import { deltaByteLength } from '@/segmentation/types';
import { computeStatistics } from '@/volume/statistics';
import { analyzeGeometry } from '@/dicom/geometry';
import { axialStack } from './fixtures';
import type { VolumeData } from '@/volume/types';

const N = 10;

function makeVolume(fill: (i: number, j: number, k: number) => number): VolumeData {
  const a = analyzeGeometry(axialStack(Array.from({ length: N }, (_, k) => k), { rows: N, columns: N, pixelSpacing: [1, 1] }));
  const g = { ...a.geometry!, dimensions: [N, N, N] as [number, number, number], physicalSize: [N, N, N] as [number, number, number] };
  const scalars = new Int16Array(N * N * N);
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    scalars[(k * N + j) * N + i] = fill(i, j, k);
  }
  return {
    id: 'test', scalars, geometry: g, statistics: computeStatistics(scalars), isHounsfield: true, issues: [],
    provenance: {
      studyInstanceUID: 's', seriesInstanceUID: 'se', modality: 'CT', sourceInstanceCount: N,
      sourceSopInstanceUIDs: [], rescaleSlope: 1, rescaleIntercept: -1024,
      transferSyntaxUID: '1.2.840.10008.1.2.1', reconstructionStrategy: 'regular', transforms: [], createdAt: 0,
    },
  };
}

/** Two dense blobs: a big one (5×5×5) and a small one (2 voxels). */
const twoBlobs = makeVolume((i, j, k) => {
  if (i >= 1 && i <= 5 && j >= 1 && j <= 5 && k >= 1 && k <= 5) return 900;
  if (k === 9 && j === 9 && i >= 8) return 1200;
  return -1000;
});

describe('threshold segmentation', () => {
  it('labels exactly the voxels inside the range', () => {
    const labels = new LabelVolume(twoBlobs.geometry.dimensions);
    thresholdSegment(twoBlobs, labels, 1, { lower: 200, upper: 32767 });
    expect(labels.countsByLabel().get(1)).toBe(5 * 5 * 5 + 2);
  });

  it('computes voxel count and physical volume', () => {
    const labels = new LabelVolume(twoBlobs.geometry.dimensions);
    thresholdSegment(twoBlobs, labels, 1, { lower: 200, upper: 32767 });
    const s = labels.stats(1, twoBlobs);
    expect(s.voxelCount).toBe(127);
    expect(s.volumeMm3).toBeCloseTo(127 * 1 * 1 * 1, 6); // 1 mm isotropic in this fixture
    expect(s.bounds).toEqual([1, 9, 1, 9, 1, 9]);
    expect(s.maxHU).toBe(1200);
  });

  it('respects the visibility restriction', () => {
    const labels = new LabelVolume(twoBlobs.geometry.dimensions);
    const visible = new Uint8Array(N * N * N).fill(1);
    for (let p = 0; p < visible.length; p++) if (p % 2 === 0) visible[p] = 0;
    thresholdSegment(twoBlobs, labels, 1, { lower: 200, upper: 32767, withinVisible: visible });
    expect(labels.countsByLabel().get(1)!).toBeLessThan(127);
  });
});

describe('region growing', () => {
  it('grows only through connected voxels in range', () => {
    const labels = new LabelVolume(twoBlobs.geometry.dimensions);
    const seed = (3 * N + 3) * N + 3;
    regionGrow(twoBlobs, labels, 2, { seedIndex: seed, lower: 200, upper: 32767, connectivity: 6 });
    // Reaches the big blob only, not the disconnected 2-voxel one.
    expect(labels.countsByLabel().get(2)).toBe(125);
  });

  it('does nothing when the seed is out of range', () => {
    const labels = new LabelVolume(twoBlobs.geometry.dimensions);
    const delta = regionGrow(twoBlobs, labels, 2, { seedIndex: 0, lower: 200, upper: 32767 });
    expect(delta.changed).toBe(0);
  });

  it('honours a voxel budget', () => {
    const labels = new LabelVolume(twoBlobs.geometry.dimensions);
    regionGrow(twoBlobs, labels, 2, { seedIndex: (3 * N + 3) * N + 3, lower: 200, upper: 32767, maxVoxels: 10 });
    expect(labels.countsByLabel().get(2)).toBe(10);
  });
});

describe('connected components', () => {
  it('finds both blobs and drops the small one', () => {
    const labels = new LabelVolume(twoBlobs.geometry.dimensions);
    thresholdSegment(twoBlobs, labels, 1, { lower: 200, upper: 32767 });
    const { components } = filterConnectedComponents(labels, 1, (c) => c.size >= 10);
    expect(components).toHaveLength(2);
    expect(labels.countsByLabel().get(1)).toBe(125);
  });

  it('can keep only the largest component', () => {
    const labels = new LabelVolume(twoBlobs.geometry.dimensions);
    thresholdSegment(twoBlobs, labels, 1, { lower: 200, upper: 32767 });
    filterConnectedComponents(labels, 1, (c, all) => c.componentId === [...all].sort((a, b) => b.size - a.size)[0].componentId);
    expect(labels.countsByLabel().get(1)).toBe(125);
  });
});

describe('sculpting', () => {
  const geometry = twoBlobs.geometry;

  it('box erase hides only what is inside the box', () => {
    const mask = new Uint8Array(N * N * N).fill(1);
    const origin = geometry.origin;
    sculptBox(mask, geometry, { min: [origin[0], origin[1], origin[2]], max: [origin[0] + 2, origin[1] + 2, origin[2] + 2] }, 'erase');
    expect(mask[0]).toBe(0);
    expect(mask[(9 * N + 9) * N + 9]).toBe(1);
  });

  it('box keep hides everything outside the box', () => {
    const mask = new Uint8Array(N * N * N).fill(1);
    const origin = geometry.origin;
    sculptBox(mask, geometry, { min: [origin[0], origin[1], origin[2]], max: [origin[0] + 2, origin[1] + 2, origin[2] + 2] }, 'keep');
    expect(mask[0]).toBe(1);
    expect(mask[(9 * N + 9) * N + 9]).toBe(0);
  });

  it('plane cut removes exactly one half-space', () => {
    const mask = new Uint8Array(N * N * N).fill(1);
    const mid = [geometry.origin[0] + 4.5, geometry.origin[1], geometry.origin[2]] as const;
    sculptPlane(mask, geometry, mid as never, [1, 0, 0], 'erase');
    let removed = 0;
    for (const v of mask) if (!v) removed++;
    expect(removed).toBe(5 * N * N); // i = 5..9
  });

  it('spherical brush works in physical millimetres', () => {
    const mask = new Uint8Array(N * N * N).fill(1);
    const centre = [geometry.origin[0] + 5, geometry.origin[1] + 5, geometry.origin[2] + 5] as const;
    const d2 = sculptSphere(mask, geometry, centre as never, 2, 'erase');
    const d4 = sculptSphere(new Uint8Array(N * N * N).fill(1), geometry, centre as never, 4, 'erase');
    expect(d4.changed).toBeGreaterThan(d2.changed * 3);
  });

  it('polygon prism cuts through the whole volume', () => {
    const mask = new Uint8Array(N * N * N).fill(1);
    const o = geometry.origin;
    const delta = sculptPolygonPrism(
      mask, geometry,
      [[o[0], o[1], o[2]], [o[0] + 4, o[1], o[2]], [o[0] + 4, o[1] + 4, o[2]], [o[0], o[1] + 4, o[2]]],
      [1, 0, 0], [0, 1, 0], [o[0], o[1], o[2]], 'erase',
    );
    expect(delta.changed).toBeGreaterThan(0);
    // Every k slice must be affected, because the cut is an extrusion.
    expect(delta.kind).toBe('sparse');
    const ks = new Set([...(delta as { indices: Int32Array }).indices].map((p) => Math.floor(p / (N * N))));
    expect(ks.size).toBe(N);
  });

  it('does not modify the source volume', () => {
    const before = twoBlobs.scalars.slice();
    const mask = new Uint8Array(N * N * N).fill(1);
    sculptSphere(mask, geometry, twoBlobs.geometry.origin, 5, 'erase');
    expect(Array.from(twoBlobs.scalars)).toEqual(Array.from(before));
  });
});

describe('visibility mask → display array', () => {
  it('replaces hidden voxels with background only in the derived array', () => {
    const mask = new Uint8Array(8).fill(1);
    mask[3] = 0;
    const src = Int16Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const out = new Int16Array(8);
    const { hidden } = applyVisibility(src, mask, out, -1024);
    expect(Array.from(out)).toEqual([1, 2, 3, -1024, 5, 6, 7, 8]);
    expect(Array.from(src)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(hidden).toBe(1);
  });

  it('resets and inverts', () => {
    const v = new VisibilityMask(4);
    v.values[0] = 0;
    expect(v.removedCount()).toBe(1);
    v.invert();
    expect(v.removedCount()).toBe(3);
    v.reset();
    expect(v.removedCount()).toBe(0);
  });
});

describe('bone workflow', () => {
  it('extracts bone and drops small fragments', () => {
    const labels = new LabelVolume(twoBlobs.geometry.dimensions);
    const r = extractBone(twoBlobs, labels, 1, { thresholdHU: 200, minComponentVoxels: 10 });
    expect(r.componentCount).toBe(2);
    expect(r.voxelCount).toBe(125);
  });

  it('bone removal hides bone without touching the source', () => {
    const labels = new LabelVolume(twoBlobs.geometry.dimensions);
    extractBone(twoBlobs, labels, 1, { thresholdHU: 200 });
    const mask = new Uint8Array(N * N * N).fill(1);
    removeBone(mask, labels, 1);
    let hidden = 0;
    for (const v of mask) if (!v) hidden++;
    expect(hidden).toBe(127);
    expect(twoBlobs.scalars.some((v) => v === 900)).toBe(true);
  });

  it('keep-bone hides everything else', () => {
    const labels = new LabelVolume(twoBlobs.geometry.dimensions);
    extractBone(twoBlobs, labels, 1, { thresholdHU: 200 });
    const mask = new Uint8Array(N * N * N).fill(1);
    keepBone(mask, labels, 1);
    let visible = 0;
    for (const v of mask) if (v) visible++;
    expect(visible).toBe(127);
  });

  it('dilation grows the label', () => {
    const labels = new LabelVolume(twoBlobs.geometry.dimensions);
    thresholdSegment(twoBlobs, labels, 1, { lower: 200, upper: 32767 });
    const before = labels.countsByLabel().get(1)!;
    dilateLabel(labels, 1, 1);
    expect(labels.countsByLabel().get(1)!).toBeGreaterThan(before);
  });

  it('derives a threshold suggestion from the dataset, not a constant', () => {
    const s = suggestBoneThreshold(twoBlobs);
    expect(s.thresholdHU).toBeGreaterThanOrEqual(150);
    expect(s.rationale).toMatch(/percentile|local minimum|no clear separation/i);
  });
});

describe('undo / redo', () => {
  it('restores the exact previous state and replays it', () => {
    const labels = new LabelVolume(twoBlobs.geometry.dimensions);
    const history = new EditHistory();
    const delta = thresholdSegment(twoBlobs, labels, 1, { lower: 200, upper: 32767 });
    history.push({ delta, target: 'labels', at: 0 });
    const after = labels.labels.slice();
    expect(history.canUndo()).toBe(true);
    history.undo(() => labels.labels);
    expect(labels.labels.every((v) => v === 0)).toBe(true);
    expect(history.canRedo()).toBe(true);
    history.redo(() => labels.labels);
    expect(Array.from(labels.labels)).toEqual(Array.from(after));
  });

  it('drops the redo stack once a new edit is made', () => {
    const labels = new LabelVolume(twoBlobs.geometry.dimensions);
    const history = new EditHistory();
    history.push({ delta: thresholdSegment(twoBlobs, labels, 1, { lower: 200, upper: 32767 }), target: 'labels', at: 0 });
    history.undo(() => labels.labels);
    expect(history.canRedo()).toBe(true);
    history.push({ delta: thresholdSegment(twoBlobs, labels, 2, { lower: 800, upper: 32767 }), target: 'labels', at: 0 });
    expect(history.canRedo()).toBe(false);
  });

  it('bounds its memory use', () => {
    const history = new EditHistory(3);
    const labels = new LabelVolume(twoBlobs.geometry.dimensions);
    for (let n = 0; n < 6; n++) {
      history.push({ delta: thresholdSegment(twoBlobs, labels, (n % 4) + 1, { lower: 200 + n, upper: 32767 }), target: 'labels', at: 0 });
    }
    expect(history.labels().undo.length).toBeLessThanOrEqual(3);
  });

  it('applies a delta in both directions', () => {
    const target = new Uint8Array([0, 0, 0]);
    const delta = {
      kind: 'sparse' as const, indices: Int32Array.from([1]),
      previous: Uint8Array.from([0]), next: Uint8Array.from([7]), label: 't', changed: 1,
    };
    applyDelta(target, delta, 'redo');
    expect(target[1]).toBe(7);
    applyDelta(target, delta, 'undo');
    expect(target[1]).toBe(0);
  });
});

describe('label to visibility', () => {
  it('erases and keeps by label', () => {
    const labels = new LabelVolume(twoBlobs.geometry.dimensions);
    thresholdSegment(twoBlobs, labels, 3, { lower: 200, upper: 32767 });
    const erase = new Uint8Array(N * N * N).fill(1);
    applyLabelToVisibility(erase, labels, 3, 'erase');
    const keep = new Uint8Array(N * N * N).fill(1);
    applyLabelToVisibility(keep, labels, 3, 'keep');
    for (let p = 0; p < erase.length; p++) expect(erase[p]).toBe(keep[p] ? 0 : 1);
  });
});

describe('large edits switch to a snapshot delta', () => {
  const BIG = 128;                       // 2.1 M voxels — past the snapshot threshold
  const bigLabels = (() => {
    const l = new LabelVolume([BIG, BIG, BIG]);
    for (let k = 40; k < 80; k++) for (let j = 40; j < 80; j++) for (let i = 40; i < 80; i++) {
      l.labels[(k * BIG + j) * BIG + i] = 1;
    }
    return l;
  })();
  const bigMask = () => new Uint8Array(BIG * BIG * BIG).fill(1);

  it('keeps a whole-volume edit small and exactly reversible', () => {
    const mask = bigMask();
    // "Keep only this segment" touches every voxel outside it.
    const delta = applyLabelToVisibility(mask, bigLabels, 1, 'keep');
    expect(delta.kind).toBe('snapshot');
    expect(delta.changed).toBe(BIG ** 3 - 40 ** 3);
    const after = mask.slice();
    applyDelta(mask, delta, 'undo');
    expect(mask.every((v) => v === 1)).toBe(true);
    applyDelta(mask, delta, 'redo');
    expect(Array.from(mask)).toEqual(Array.from(after));
  });

  it('a snapshot delta is orders of magnitude smaller than the mask it describes', () => {
    const mask = bigMask();
    const delta = applyLabelToVisibility(mask, bigLabels, 1, 'keep');
    // A sparse delta would have cost 6 bytes per changed voxel (~12 MB here).
    expect(deltaByteLength(delta)).toBeLessThan(mask.length / 100);
  });

  it('a small edit stays sparse', () => {
    const mask = bigMask();
    const delta = applyLabelToVisibility(mask, bigLabels, 1, 'erase');
    expect(delta.kind).toBe('sparse');
    expect(delta.changed).toBe(40 ** 3);
  });

  it('history never evicts the entry just pushed, however large', () => {
    const mask = bigMask();
    const history = new EditHistory(50, 1); // a 1-byte budget: everything is "too big"
    history.push({ delta: applyLabelToVisibility(mask, bigLabels, 1, 'keep'), target: 'visibility', at: 0 });
    expect(history.canUndo()).toBe(true);
    history.undo(() => mask);
    expect(mask.every((v) => v === 1)).toBe(true);
  });
});

describe('run-length coding', () => {
  it('round-trips masks of every shape', () => {
    for (const make of [
      () => new Uint8Array(5000),
      () => new Uint8Array(5000).fill(3),
      () => { const m = new Uint8Array(5000); m.fill(1, 1000, 4000); return m; },
      () => Uint8Array.from({ length: 5000 }, (_, i) => (i % 3 === 0 ? 2 : 0)),
      () => Uint8Array.from({ length: 5000 }, (_, i) => i % 256),
    ]) {
      const m = make();
      expect(Array.from(rleDecode(rleEncode(m), m.length))).toEqual(Array.from(m));
    }
  });
});

describe('bone threshold suggestion', () => {
  /** Build a volume whose histogram has a given shape: [centreHU, spreadHU, count]. */
  const fromCounts = (spec: Array<[number, number, number]>): VolumeData => {
    const values: number[] = [];
    for (const [hu, spread, n] of spec) {
      for (let i = 0; i < n; i++) values.push(hu + Math.round(((i / n) - 0.5) * 2 * spread));
    }
    while (values.length % 8 !== 0) values.push(-1000);
    const side = Math.ceil(Math.cbrt(values.length));
    const padded = Int16Array.from({ length: side ** 3 }, (_, i) => values[i] ?? -1000);
    const v = makeVolume(() => 0);
    return { ...v, scalars: padded, statistics: computeStatistics(padded) };
  };

  it('finds the first valley between the soft-tissue tail and bone', () => {
    // Shape taken from a real head CT: a local minimum near 170 HU, a small rise around
    // 270 HU, then a long decline and a cortical-bone peak above 1000 HU.
    const v = fromCounts([
      [-1000, 30, 400000], [40, 60, 60000], [130, 20, 16000], [175, 22, 13000],
      [225, 22, 13500], [275, 25, 14700], [340, 30, 8600], [460, 60, 5800],
      [700, 100, 4500], [870, 80, 4300], [1040, 90, 4800],
    ]);
    const s = suggestBoneThreshold(v);
    expect(s.thresholdHU).toBeGreaterThanOrEqual(140);
    expect(s.thresholdHU).toBeLessThanOrEqual(240);
    expect(s.rationale).toMatch(/local minimum/);
  });

  it('does not settle on the deeper minimum inside the bone range', () => {
    const v = fromCounts([
      [-1000, 30, 400000], [40, 60, 60000], [175, 22, 13000], [275, 25, 14700],
      [340, 30, 8600], [650, 90, 4550], [870, 80, 4300], [1040, 90, 4800],
    ]);
    expect(suggestBoneThreshold(v).thresholdHU).toBeLessThan(400);
  });

  it('falls back to the dense tail when there is no valley at all', () => {
    const v = fromCounts([[-1000, 30, 400000], [40, 60, 80000], [220, 90, 4000], [350, 60, 2000], [450, 40, 1000]]);
    const s = suggestBoneThreshold(v);
    expect(s.thresholdHU).toBeGreaterThanOrEqual(150);
    expect(s.thresholdHU).toBeLessThanOrEqual(400);
  });

  it('never proposes a threshold inside the soft-tissue range', () => {
    for (const v of [
      fromCounts([[-1000, 30, 400000], [40, 60, 60000], [175, 22, 13000], [275, 25, 14700], [1040, 90, 4800]]),
      fromCounts([[-1000, 30, 400000], [50, 40, 90000], [95, 20, 20000], [600, 120, 3000]]),
    ]) {
      expect(suggestBoneThreshold(v).thresholdHU).toBeGreaterThanOrEqual(150);
    }
  });
});
