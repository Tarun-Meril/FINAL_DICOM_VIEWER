import { describe, it, expect } from 'vitest';
import { analyzeGeometry } from '@/dicom/geometry';
import { VolumeBuilder, BACKGROUND_HU } from '@/volume/construction';
import { verifyVolumeGeometry } from '@/volume/validation';
import { computeStatistics } from '@/volume/statistics';
import { downsampleVolume, resampleIsotropic, chooseDownsampleFactor, sampleTrilinear } from '@/volume/resampling';
import { indexToWorld, worldToIndex } from '@/math/vec3';
import { axialStack, makeInstance } from './fixtures';
import type { VolumeData } from '@/volume/types';

const SIZE = 8;
/** Slice filled with a constant value, so the k index is recoverable from the data. */
const constantSlice = (v: number) => Int16Array.from({ length: SIZE * SIZE }, () => v);

describe('volume construction — regular stacks', () => {
  it('places each slice at its measured grid index', () => {
    const instances = axialStack([0, 1, 2, 3], { rows: SIZE, columns: SIZE });
    const a = analyzeGeometry(instances);
    const b = new VolumeBuilder(a.geometry!, a);
    a.slices.forEach((s, k) => b.push({ values: constantSlice(k * 100), slice: s }));
    const r = b.finish();
    expect(r.writtenSlices).toBe(4);
    expect(r.interpolatedSlices).toBe(0);
    for (let k = 0; k < 4; k++) expect(r.scalars[k * SIZE * SIZE]).toBe(k * 100);
  });

  it('leaves gaps as air rather than fabricating anatomy', () => {
    const instances = axialStack([0, 1, 2, 4], { rows: SIZE, columns: SIZE });
    const a = analyzeGeometry(instances);
    expect(a.strategy).toBe('resample-irregular');
    // With the regular strategy forced, the unacquired index 3 must stay at background
    // rather than being filled with a neighbouring slice.
    const forced = { ...a, strategy: 'regular' as const };
    const b = new VolumeBuilder(a.geometry!, forced);
    forced.slices.forEach((s, i) => b.push({ values: constantSlice(500 + i), slice: s }));
    const r = b.finish();
    expect(r.scalars[3 * SIZE * SIZE]).toBe(BACKGROUND_HU);
    expect(r.scalars[4 * SIZE * SIZE]).toBe(503);
  });

  it('keeps the first slice at a duplicated position', () => {
    const instances = axialStack([0, 1, 1, 2], { rows: SIZE, columns: SIZE });
    const a = analyzeGeometry(instances);
    const b = new VolumeBuilder(a.geometry!, { ...a, strategy: 'regular' });
    a.slices.forEach((s, i) => b.push({ values: constantSlice(i), slice: s }));
    const r = b.finish();
    expect(r.scalars[1 * SIZE * SIZE]).toBe(1); // not 2
  });
});

describe('volume construction — irregular stacks', () => {
  it('linearly interpolates onto a uniform grid', () => {
    // Acquired at 0, 1, 2, 4 mm; the median spacing is 1 mm so the grid is 0,1,2,3,4.
    const instances = axialStack([0, 1, 2, 4], { rows: SIZE, columns: SIZE });
    const a = analyzeGeometry(instances);
    expect(a.geometry!.spacing[2]).toBeCloseTo(1, 9);
    expect(a.geometry!.dimensions[2]).toBe(5);
    const b = new VolumeBuilder(a.geometry!, a);
    [0, 100, 200, 400].forEach((v, i) => b.push({ values: constantSlice(v), slice: a.slices[i] }));
    const r = b.finish();
    expect(r.scalars[0]).toBe(0);
    expect(r.scalars[1 * SIZE * SIZE]).toBe(100);
    expect(r.scalars[2 * SIZE * SIZE]).toBe(200);
    expect(r.scalars[3 * SIZE * SIZE]).toBe(300); // interpolated between 200 and 400
    expect(r.scalars[4 * SIZE * SIZE]).toBe(400);
    expect(r.interpolatedSlices).toBe(1);
    expect(r.transforms[0].kind).toBe('slice-resample');
  });
});

describe('volume construction — gantry tilt', () => {
  it('de-shears a tilted stack and records the transform', () => {
    const spacing = 1;
    const instances = [0, 1, 2, 3].map((k) => makeInstance({
      rows: SIZE, columns: SIZE, pixelSpacing: [1, 1],
      imagePositionPatient: [0, k * 0.5, k * spacing],
      gantryDetectorTilt: 26.5,
    }));
    const a = analyzeGeometry(instances);
    expect(a.strategy).toBe('shear-correct');
    const b = new VolumeBuilder(a.geometry!, a);
    // A slice with a single bright voxel: after de-shearing it must stay at the same (i,j).
    const mk = (v: number) => { const s = new Int16Array(SIZE * SIZE).fill(-1000); s[4 * SIZE + 4] = v; return s; };
    a.slices.forEach((s, k) => b.push({ values: mk(1000 + k), slice: s }));
    const r = b.finish();
    expect(r.transforms.some((t) => t.kind === 'shear-correction')).toBe(true);
    // Slice 2 was displaced 1 mm in +y; after correction the bright voxel moves to j=3.
    const sliceK = 2;
    const plane = r.scalars.subarray(sliceK * SIZE * SIZE, (sliceK + 1) * SIZE * SIZE);
    const maxIdx = plane.indexOf(Math.max(...plane));
    expect(Math.floor(maxIdx / SIZE)).toBe(3);
  });
});

describe('geometry conformance (§38)', () => {
  it('passes every check for a clean axial stack', () => {
    const a = analyzeGeometry(axialStack([0, 1, 2, 3, 4], { rows: SIZE, columns: SIZE }));
    const r = verifyVolumeGeometry(a.geometry!, a);
    expect(r.allPassed).toBe(true);
    expect(r.checks.length).toBeGreaterThanOrEqual(8);
  });

  it('round-trips index → world → index exactly', () => {
    const a = analyzeGeometry(axialStack([0, 2, 4], { rows: SIZE, columns: SIZE, pixelSpacing: [0.6, 0.9] }));
    const g = a.geometry!;
    for (const idx of [[0, 0, 0], [3, 5, 2], [7, 7, 1]] as Array<[number, number, number]>) {
      const w = indexToWorld(idx, g.origin, g.spacing, g.iAxis, g.jAxis, g.kAxis);
      const back = worldToIndex(w, g.origin, g.spacing, g.iAxis, g.jAxis, g.kAxis);
      expect(back[0]).toBeCloseTo(idx[0], 9);
      expect(back[1]).toBeCloseTo(idx[1], 9);
      expect(back[2]).toBeCloseTo(idx[2], 9);
    }
  });

  it('places voxel (0,0,0) at the first slice Image Position (Patient)', () => {
    const a = analyzeGeometry(axialStack([10, 11, 12], { rows: SIZE, columns: SIZE }));
    const g = a.geometry!;
    expect(indexToWorld([0, 0, 0], g.origin, g.spacing, g.iAxis, g.jAxis, g.kAxis)).toEqual([-10, -20, 10]);
  });
});

describe('statistics', () => {
  it('computes exact min/max/mean and a usable histogram', () => {
    const data = Int16Array.from([-1000, -1000, 0, 40, 40, 1200, 3000, -500]);
    const s = computeStatistics(data);
    expect(s.min).toBe(-1000);
    expect(s.max).toBe(3000);
    expect(s.mean).toBeCloseTo(data.reduce((a, b) => a + b, 0) / data.length, 6);
    expect(s.histogram.total).toBe(data.length);
    expect(s.denseFraction).toBeCloseTo(2 / 8, 6);
    expect(s.airFraction).toBeCloseTo(2 / 8, 6); // strictly below -500 HU
  });
});

describe('resampling', () => {
  const makeVolume = (): VolumeData => {
    const a = analyzeGeometry(axialStack([0, 1, 2, 3], { rows: 4, columns: 4, pixelSpacing: [1, 1] }));
    const scalars = new Int16Array(4 * 4 * 4);
    for (let i = 0; i < scalars.length; i++) scalars[i] = i;
    return {
      id: 'v', scalars, geometry: { ...a.geometry!, dimensions: [4, 4, 4], physicalSize: [4, 4, 4] },
      statistics: computeStatistics(scalars), isHounsfield: true, issues: [],
      provenance: {
        studyInstanceUID: 's', seriesInstanceUID: 'se', modality: 'CT', sourceInstanceCount: 4,
        sourceSopInstanceUIDs: [], rescaleSlope: 1, rescaleIntercept: -1024,
        transferSyntaxUID: '1.2.840.10008.1.2.1', reconstructionStrategy: 'regular',
        transforms: [], createdAt: 0,
      },
    };
  };

  it('box-filters on downsample and records the transform', () => {
    const v = makeVolume();
    const d = downsampleVolume(v, [2, 2, 2]);
    expect(d.geometry.dimensions).toEqual([2, 2, 2]);
    expect(d.geometry.spacing).toEqual([2, 2, 2]);
    expect(d.provenance.transforms.at(-1)?.kind).toBe('downsample');
    expect(v.scalars.length).toBe(64); // the source is untouched
  });

  it('never replaces the source volume', () => {
    const v = makeVolume();
    const iso = resampleIsotropic(v, 0.5);
    expect(iso).not.toBe(v);
    expect(v.geometry.spacing).toEqual([1, 1, 1]);
    expect(iso.provenance.transforms.at(-1)?.kind).toBe('isotropic-resample');
  });

  it('chooses a factor that fits the budget', () => {
    expect(chooseDownsampleFactor([512, 512, 250], 1e12, 4096)).toEqual([1, 1, 1]);
    const f = chooseDownsampleFactor([512, 512, 900], 60_000_000, 512);
    const voxels = Math.floor(512 / f[0]) * Math.floor(512 / f[1]) * Math.floor(900 / f[2]);
    expect(voxels).toBeLessThanOrEqual(60_000_000);
    expect(Math.floor(900 / f[2])).toBeLessThanOrEqual(512);
  });

  it('samples trilinearly and returns the outside value beyond the grid', () => {
    const data = Int16Array.from([0, 100, 0, 0, 0, 0, 0, 0]);
    expect(sampleTrilinear(data, [2, 2, 2], 0.5, 0, 0)).toBeCloseTo(50, 6);
    expect(sampleTrilinear(data, [2, 2, 2], -1, 0, 0, -1024)).toBe(-1024);
  });
});
