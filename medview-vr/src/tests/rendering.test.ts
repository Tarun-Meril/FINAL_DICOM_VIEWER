import { describe, it, expect } from 'vitest';
import {
  evaluateOpacity, evaluateColor, normalizeTransferFunction, shiftOpacity,
  scaleOpacityWidth, effectiveRange,
} from '@/rendering/transferFunction';
import {
  PRESET_BONE, PRESET_SOFT_TISSUE, PRESET_LUNG, PRESET_VASCULAR, BUILT_IN_PRESETS,
  adaptPresetToVolume, chooseInitialPreset, exportPresets, importPresets, emptyCustomPreset,
} from '@/rendering/presets';
import { CAMERA_PRESETS, cameraPreset, placeCamera, screenDirections } from '@/rendering/camera';
import { anatomicalLabel } from '@/dicom/geometry';
import { defaultClipState, defaultCropBox, resolveClipPlanes, resolveCropPlanes, cropBoxDimensionsMm } from '@/rendering/clipping';
import { directionFlat } from '@/math/vec3';
import { analyzeGeometry } from '@/dicom/geometry';
import { computeStatistics } from '@/volume/statistics';
import { axialStack } from './fixtures';
import type { VolumeStatistics } from '@/volume/types';

describe('transfer function evaluation', () => {
  it('interpolates opacity linearly between control points', () => {
    const tf = normalizeTransferFunction({
      ...PRESET_BONE, opacity: [{ hu: 0, opacity: 0 }, { hu: 100, opacity: 1 }], interpolation: 'linear',
    });
    expect(evaluateOpacity(tf, -50)).toBe(0);
    expect(evaluateOpacity(tf, 50)).toBeCloseTo(0.5, 9);
    expect(evaluateOpacity(tf, 500)).toBe(1);
  });

  it('uses smoothstep for smooth interpolation', () => {
    const tf = normalizeTransferFunction({
      ...PRESET_BONE, opacity: [{ hu: 0, opacity: 0 }, { hu: 100, opacity: 1 }], interpolation: 'smooth',
    });
    expect(evaluateOpacity(tf, 50)).toBeCloseTo(0.5, 9);
    expect(evaluateOpacity(tf, 25)).toBeLessThan(0.25);
  });

  it('interpolates colour between stops', () => {
    const tf = normalizeTransferFunction({
      ...PRESET_BONE, color: [{ hu: 0, color: [0, 0, 0] }, { hu: 100, color: [1, 1, 1] }],
    });
    expect(evaluateColor(tf, 50)).toEqual([0.5, 0.5, 0.5]);
  });

  it('sorts and de-duplicates control points', () => {
    const tf = normalizeTransferFunction({
      ...PRESET_BONE,
      opacity: [{ hu: 300, opacity: 1 }, { hu: 100, opacity: 0 }, { hu: 100, opacity: 0.5 }],
    });
    expect(tf.opacity.map((p) => p.hu)).toEqual([100, 300]);
  });

  it('shifts and scales the ramp without changing its shape', () => {
    const shifted = shiftOpacity(PRESET_BONE, 200);
    expect(shifted.opacity[3].hu).toBe(PRESET_BONE.opacity[3].hu + 200);
    const wide = scaleOpacityWidth(PRESET_BONE, 2);
    const before = PRESET_BONE.opacity.at(-1)!.hu - PRESET_BONE.opacity[0].hu;
    const after = wide.opacity.at(-1)!.hu - wide.opacity[0].hu;
    expect(after).toBeCloseTo(before * 2, 6);
  });

  it('reports the range where the function is actually visible', () => {
    const [lo, hi] = effectiveRange(PRESET_BONE);
    expect(lo).toBeGreaterThan(100);
    expect(hi).toBeGreaterThanOrEqual(3000);
  });
});

describe('presets', () => {
  it('ships the required preset families', () => {
    const ids = BUILT_IN_PRESETS.map((p) => p.id);
    for (const id of ['bone', 'bone-detailed', 'bone-soft-tissue', 'soft-tissue', 'skin',
      'muscle', 'vascular-cta', 'bone-high-contrast', 'lung', 'mip']) {
      expect(ids).toContain(id);
    }
  });

  it('every built-in preset is monotonic in HU and bounded in opacity', () => {
    for (const p of BUILT_IN_PRESETS) {
      for (let i = 1; i < p.opacity.length; i++) expect(p.opacity[i].hu).toBeGreaterThan(p.opacity[i - 1].hu);
      for (const pt of p.opacity) { expect(pt.opacity).toBeGreaterThanOrEqual(0); expect(pt.opacity).toBeLessThanOrEqual(1); }
      for (const c of p.color) for (const v of c.color) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    }
  });

  const statsFor = (values: number[]): VolumeStatistics => computeStatistics(Int16Array.from(values));

  it('adapts a bone preset down when the dataset has no dense tail', () => {
    // A soft-tissue-only volume: the bone entry point should move down towards it.
    const stats = statsFor(Array.from({ length: 4000 }, (_, i) => (i < 3800 ? -1000 : 60)));
    const { tf, report } = adaptPresetToVolume(PRESET_BONE, stats);
    expect(tf.opacity.find((p) => p.opacity > 0)!.hu).toBeLessThanOrEqual(
      PRESET_BONE.opacity.find((p) => p.opacity > 0)!.hu);
    expect(report.rationale).toMatch(/percentile/);
  });

  it('leaves a preset alone when it already matches the dataset', () => {
    const stats = statsFor([...Array(3000).fill(-1000), ...Array(600).fill(50), ...Array(400).fill(900)]);
    const { report } = adaptPresetToVolume(PRESET_BONE, stats);
    expect(Math.abs(report.shiftHU)).toBeLessThanOrEqual(120);
  });

  it('does not adapt non-density-anchored presets', () => {
    const stats = statsFor([-1000, -1000, 40]);
    expect(adaptPresetToVolume(PRESET_SOFT_TISSUE, stats).tf).toBe(PRESET_SOFT_TISSUE);
    expect(adaptPresetToVolume(PRESET_LUNG, stats).tf).toBe(PRESET_LUNG);
  });

  it('opens a bone-bearing dataset with the bone preset', () => {
    const stats = statsFor([...Array(2000).fill(-1000), ...Array(400).fill(40), ...Array(100).fill(900)]);
    expect(chooseInitialPreset(stats, false).preset.id).toBe('bone');
  });

  it('opens a contrast study with the vascular preset', () => {
    const stats = statsFor([...Array(2000).fill(-1000), ...Array(400).fill(40), ...Array(100).fill(400)]);
    expect(chooseInitialPreset(stats, true).preset.id).toBe(PRESET_VASCULAR.id);
  });

  it('opens an air-dominated low-density dataset with the lung preset', () => {
    const stats = statsFor([...Array(700).fill(-850), ...Array(300).fill(20)]);
    expect(chooseInitialPreset(stats, false).preset.id).toBe('lung');
  });

  it('round-trips presets through export/import', () => {
    const custom = emptyCustomPreset(PRESET_BONE);
    const json = exportPresets([custom]);
    const back = importPresets(json);
    expect(back).toHaveLength(1);
    expect(back[0].opacity).toEqual(custom.opacity);
    expect(back[0].builtIn).toBe(false);
  });

  it('rejects a foreign preset file', () => {
    expect(() => importPresets('{"schema":"something-else","version":1,"presets":[]}')).toThrow(/not a MedView/);
  });
});

describe('camera presets and anatomical screen directions', () => {
  it('offers the six cardinal and four oblique views', () => {
    expect(CAMERA_PRESETS).toHaveLength(10);
    for (const id of ['anterior', 'posterior', 'left', 'right', 'superior', 'inferior']) {
      expect(() => cameraPreset(id as never)).not.toThrow();
    }
  });

  it('puts the patient left on screen-right in the anterior view (radiological convention)', () => {
    const state = placeCamera(cameraPreset('anterior'), [0, 0, 0], 100, false);
    const d = screenDirections(state);
    expect(anatomicalLabel(d.right)).toBe('L');
    expect(anatomicalLabel(d.up)).toBe('S');
    expect(anatomicalLabel(d.towardsViewer)).toBe('A');
  });

  it('puts the patient right on screen-right in the posterior view', () => {
    const d = screenDirections(placeCamera(cameraPreset('posterior'), [0, 0, 0], 100, false));
    expect(anatomicalLabel(d.right)).toBe('R');
    expect(anatomicalLabel(d.up)).toBe('S');
  });

  it('shows anterior on the left in a left lateral view', () => {
    const d = screenDirections(placeCamera(cameraPreset('left'), [0, 0, 0], 100, false));
    expect(anatomicalLabel(d.right)).toBe('P');
    expect(anatomicalLabel(d.left)).toBe('A');
  });

  it('matches the declared screenRight of every cardinal preset', () => {
    for (const p of CAMERA_PRESETS.filter((x) => x.cardinal)) {
      const d = screenDirections(placeCamera(p, [0, 0, 0], 100, false));
      expect(anatomicalLabel(d.right)).toBe(p.screenRight);
    }
  });

  it('places oblique views between the two axes they name', () => {
    for (const p of CAMERA_PRESETS.filter((x) => !x.cardinal)) {
      const d = screenDirections(placeCamera(p, [0, 0, 0], 100, false));
      expect(p.screenRight).toContain(anatomicalLabel(d.right));
      // A 45-degree oblique must be genuinely between two axes.
      expect(Math.abs(Math.abs(d.right[0]) - Math.abs(d.right[1]))).toBeLessThan(1e-6);
    }
  });

  it('places the camera far enough away to see the whole volume', () => {
    const s = placeCamera(cameraPreset('anterior'), [10, 20, 30], 150, false, 30);
    const dist = Math.hypot(s.position[0] - 10, s.position[1] - 20, s.position[2] - 30);
    expect(dist).toBeGreaterThan(150);
    expect(s.focalPoint).toEqual([10, 20, 30]);
  });
});

describe('vtk direction matrix layout', () => {
  it('orders the flat direction array as [iAxis, jAxis, kAxis]', () => {
    // vtkImageData copies direction[0..2] into column 0 of its column-major
    // index→world matrix, so direction[0..2] must be the world direction of +i.
    const flat = directionFlat([1, 0, 0], [0, 1, 0], [0, 0, 1]);
    expect(flat).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const oblique = directionFlat([0, 1, 0], [0, 0, -1], [-1, 0, 0]);
    expect(oblique.slice(0, 3)).toEqual([0, 1, 0]);
    expect(oblique.slice(3, 6)).toEqual([0, 0, -1]);
    expect(oblique.slice(6, 9)).toEqual([-1, 0, 0]);
  });
});

describe('clipping and crop box', () => {
  const geometry = analyzeGeometry(axialStack([0, 1, 2, 3], { rows: 8, columns: 8, pixelSpacing: [1, 1] })).geometry!;

  it('emits no planes when nothing is enabled', () => {
    expect(resolveClipPlanes(defaultClipState(), geometry)).toHaveLength(0);
  });

  it('emits one plane per enabled axis and two for a slab', () => {
    const state = defaultClipState();
    state[0] = { ...state[0], enabled: true, position: 0.5 };
    expect(resolveClipPlanes(state, geometry)).toHaveLength(1);
    state[0] = { ...state[0], thickness: 10 };
    expect(resolveClipPlanes(state, geometry)).toHaveLength(2);
  });

  // vtk.js clips where dot(planeOrigin - point, normal) > 0, i.e. it KEEPS the half-space
  // the normal points into (isPointClipped in vtkVolumeFS.glsl). These two tests pin that
  // convention: getting it backwards empties the viewport instead of cutting it.
  const kept = (plane: { origin: readonly number[]; normal: readonly number[] }, p: readonly number[]) =>
    (p[0] - plane.origin[0]) * plane.normal[0] +
    (p[1] - plane.origin[1]) * plane.normal[1] +
    (p[2] - plane.origin[2]) * plane.normal[2] >= 0;

  it('a "Left" plane keeps the patient-right side', () => {
    const state = defaultClipState();
    state[1] = { ...state[1], id: 'left', enabled: true, position: 0.5 };
    const plane = resolveClipPlanes(state, geometry)[0];
    const midX = plane.origin[0];
    // +x is patient Left. A point further left than the plane must be clipped away.
    expect(kept(plane, [midX - 2, 0, 0])).toBe(true);
    expect(kept(plane, [midX + 2, 0, 0])).toBe(false);
  });

  it('a crop box keeps its inside and clips its outside', () => {
    const crop = {
      ...defaultCropBox(), enabled: true, showOnlyRoi: true,
      min: [0.25, 0.25, 0.25] as [number, number, number],
      max: [0.75, 0.75, 0.75] as [number, number, number],
    };
    const planes = resolveCropPlanes(crop, geometry);
    const at = (axis: number, t: number) => geometry.origin[axis] + (geometry.dimensions[axis] - 1) * geometry.spacing[axis] * t;
    const inside = [at(0, 0.5), at(1, 0.5), at(2, 0.5)];
    const outside = [at(0, 0), at(1, 0), at(2, 0)];
    expect(planes.every((p) => kept(p, inside))).toBe(true);
    expect(planes.some((p) => !kept(p, outside))).toBe(true);
  });

  it('a slab keeps only material between its two planes', () => {
    const state = defaultClipState();
    const superior = state.findIndex((c) => c.id === 'superior');
    state[superior] = { ...state[superior], enabled: true, position: 0.5, thickness: 1 };
    const planes = resolveClipPlanes(state, geometry);
    expect(planes).toHaveLength(2);
    const mid = planes[0].origin[2];
    expect(planes.every((p) => kept(p, [0, 0, mid - 0.4]))).toBe(true);
    expect(planes.every((p) => kept(p, [0, 0, mid + 0.4]))).toBe(false);
    expect(planes.every((p) => kept(p, [0, 0, mid - 2.0]))).toBe(false);
  });

  it('inverts the kept half-space', () => {
    const state = defaultClipState();
    state[0] = { ...state[0], enabled: true, invert: false };
    const normal = resolveClipPlanes(state, geometry)[0].normal;
    state[0] = { ...state[0], invert: true };
    const inverted = resolveClipPlanes(state, geometry)[0].normal;
    expect(inverted).toEqual([-normal[0], -normal[1], -normal[2]]);
  });

  it('shows the box outline before it crops', () => {
    const crop = { ...defaultCropBox(), enabled: true };
    expect(resolveCropPlanes(crop, geometry)).toHaveLength(0);
  });

  it('emits six planes once "show only ROI" is set, and none when inverted', () => {
    const crop = { ...defaultCropBox(), enabled: true, showOnlyRoi: true };
    expect(resolveCropPlanes(crop, geometry)).toHaveLength(6);
    expect(resolveCropPlanes({ ...crop, invert: true }, geometry)).toHaveLength(0);
  });

  it('reports crop dimensions in physical millimetres', () => {
    const crop = { ...defaultCropBox(), enabled: true, min: [0.25, 0, 0] as [number, number, number], max: [0.75, 1, 1] as [number, number, number] };
    const d = cropBoxDimensionsMm(crop, geometry);
    // The volume spans 8 voxels × 1 mm in x (bounds are voxel-centre based: 7 mm).
    expect(d[0]).toBeCloseTo(3.5, 6);
  });
});
