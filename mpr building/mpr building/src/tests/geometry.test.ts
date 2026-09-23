import { describe, expect, it } from 'vitest';
import {
  analyseGantryTilt,
  analyseSliceSpacing,
  buildSeriesGeometry,
  classifyAcquisitionPlane,
  computeSliceNormal,
  directionsFromIOP,
  sortFramesByPosition,
  volumeCentreWorld,
} from '../core/geometry/DICOMGeometry';
import { det3, dot, normalize } from '../core/math/vec';
import {
  makeLocalizer,
  makeSeries,
  rotateAboutAxis,
  shuffleDeterministic,
} from './fixtures/synthetic';
import {
  excludeNonVolumetricFrames,
  groupFramesForVolume,
  prepareCandidateVolumes,
} from '../core/volume/SeriesValidator';

describe('1. Standard axial CT', () => {
  const frames = makeSeries({
    pixelSpacing: [0.7, 0.7],
    sliceSpacing: 1.25,
    numberOfSlices: 120,
  });
  const g = buildSeriesGeometry(frames);

  it('accepts the series', () => {
    expect(g.verdict).toBe('ok');
    expect(g.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('derives the slice normal from the orientation cosines', () => {
    expect(g.sliceNormal[0]).toBeCloseTo(0, 12);
    expect(g.sliceNormal[1]).toBeCloseTo(0, 12);
    expect(g.sliceNormal[2]).toBeCloseTo(1, 12);
  });

  it('uses measured spacing, not slice thickness', () => {
    expect(g.spacing[2]).toBeCloseTo(1.25, 9);
  });

  it('maps DICOM Pixel Spacing onto the correct volume axes', () => {
    // PixelSpacing = [between rows, between columns]
    // spacing[0] runs along rowDirection -> PixelSpacing[1]
    const anis = buildSeriesGeometry(
      makeSeries({ pixelSpacing: [0.9, 0.4], numberOfSlices: 10 }),
    );
    expect(anis.spacing[0]).toBeCloseTo(0.4, 12);
    expect(anis.spacing[1]).toBeCloseTo(0.9, 12);
  });

  it('produces a right-handed (non-mirrored) basis', () => {
    expect(det3(g.rowDirection, g.columnDirection, g.sliceNormal)).toBeCloseTo(1, 12);
  });

  it('reports the acquisition plane', () => {
    expect(g.acquisitionPlane).toBe('axial');
    expect(g.oblique).toBe(false);
  });
});

describe('2. Oblique CT', () => {
  const rowDirection = rotateAboutAxis([1, 0, 0], [0, 1, 0], 30);
  const columnDirection = rotateAboutAxis([0, 1, 0], [0, 1, 0], 30);
  const frames = makeSeries({ rowDirection, columnDirection, numberOfSlices: 60 });
  const g = buildSeriesGeometry(frames);

  it('builds without error and keeps the true orientation', () => {
    expect(g.verdict).not.toBe('unsafe');
    const expected = computeSliceNormal(
      normalize(rowDirection),
      normalize(columnDirection),
    );
    expect(dot(g.sliceNormal, expected)).toBeCloseTo(1, 10);
  });

  it('does not assume row=X, column=Y, slice=Z', () => {
    expect(Math.abs(g.sliceNormal[0])).toBeGreaterThan(0.4);
    expect(classifyAcquisitionPlane(g.sliceNormal).oblique).toBe(true);
  });
});

describe('3. Gantry-tilted CT', () => {
  // Slices stay parallel but their origins march obliquely: classic tilt shear.
  const frames = makeSeries({
    numberOfSlices: 50,
    sliceSpacing: 2,
    perSliceInPlaneShift: [0, 0.35, 0],
  });
  const g = buildSeriesGeometry(frames);

  it('detects the shear instead of ignoring it', () => {
    expect(g.gantryTilt.sheared).toBe(true);
    expect(g.gantryTilt.shearAngleDeg).toBeGreaterThan(5);
    expect(g.issues.some((i) => i.code === 'GANTRY_TILT_SHEAR')).toBe(true);
  });

  it('still permits reformatting, with a warning', () => {
    expect(g.verdict).toBe('ok-with-warnings');
  });

  it('reports the in-plane component of the inter-slice step', () => {
    expect(g.gantryTilt.inPlaneStepMm[1]).toBeCloseTo(0.35, 6);
  });

  it('reports no shear for an untilted stack', () => {
    const clean = buildSeriesGeometry(makeSeries({ numberOfSlices: 20 }));
    expect(clean.gantryTilt.sheared).toBe(false);
    expect(clean.gantryTilt.shearAngleDeg).toBeCloseTo(0, 9);
  });
});

describe('4. Non-isotropic CT', () => {
  const cases: Array<[number, number, number]> = [
    [0.5, 0.5, 0.5],
    [0.5, 0.5, 1],
    [0.5, 0.5, 2.5],
    [0.7, 0.7, 5],
  ];

  it.each(cases)('preserves %s x %s x %s mm voxels', (sx, sy, sz) => {
    const g = buildSeriesGeometry(
      makeSeries({ pixelSpacing: [sy, sx], sliceSpacing: sz, numberOfSlices: 30 }),
    );
    expect(g.spacing[0]).toBeCloseTo(sx, 9);
    expect(g.spacing[1]).toBeCloseTo(sy, 9);
    expect(g.spacing[2]).toBeCloseTo(sz, 9);
    expect(g.verdict).not.toBe('unsafe');
  });

  it('flags strongly anisotropic voxels for the operator', () => {
    const g = buildSeriesGeometry(
      makeSeries({ pixelSpacing: [0.7, 0.7], sliceSpacing: 5, numberOfSlices: 30 }),
    );
    expect(g.issues.some((i) => i.code === 'ANISOTROPIC_VOXELS')).toBe(true);
  });
});

describe('5. MRI with non-standard orientation', () => {
  // Sagittal-oblique MR acquisition.
  const rowDirection = [0, 1, 0] as const;
  const columnDirection = rotateAboutAxis([0, 0, -1], [0, 1, 0], 12);
  const g = buildSeriesGeometry(
    makeSeries({
      modality: 'MR',
      rowDirection: [...rowDirection] as [number, number, number],
      columnDirection,
      pixelSpacing: [0.9, 0.9],
      sliceSpacing: 3,
      numberOfSlices: 30,
      rescaleIntercept: undefined,
      imageType: ['ORIGINAL', 'PRIMARY', 'M', 'NORM'],
      seriesDescription: 'T2 TSE SAG',
    }),
  );

  it('builds MR geometry without CT assumptions', () => {
    expect(g.modality).toBe('MR');
    expect(g.verdict).not.toBe('unsafe');
    expect(g.frames[0].rescaleIntercept).toBeUndefined();
  });

  it('orients from the real cosines', () => {
    expect(Math.abs(g.sliceNormal[0])).toBeGreaterThan(0.9);
  });
});

describe('6. Reversed and shuffled slice ordering', () => {
  const frames = makeSeries({ numberOfSlices: 64, sliceSpacing: 1.5 });

  it('sorts by patient-space projection, not InstanceNumber', () => {
    const reversed = [...frames].reverse();
    const g = buildSeriesGeometry(reversed);
    const first = g.frames[0].imagePositionPatient;
    expect(first[2]).toBeCloseTo(frames[0].imagePositionPatient[2], 9);
    expect(g.spacing[2]).toBeCloseTo(1.5, 9);
  });

  it('produces the same volume from a shuffled input order', () => {
    const shuffled = shuffleDeterministic(frames);
    const a = buildSeriesGeometry(frames);
    const b = buildSeriesGeometry(shuffled);
    expect(b.frames.map((f) => f.sopInstanceUID)).toEqual(
      a.frames.map((f) => f.sopInstanceUID),
    );
    expect(b.origin).toEqual(a.origin);
  });

  it('ignores a misleading InstanceNumber sequence entirely', () => {
    const scrambled = frames.map((f, idx) => ({
      ...f,
      instanceNumber: frames.length - idx,
    }));
    const normal = computeSliceNormal(
      directionsFromIOP(frames[0].imageOrientationPatient).rowDirection,
      directionsFromIOP(frames[0].imageOrientationPatient).columnDirection,
    );
    const sorted = sortFramesByPosition(scrambled, normal);
    for (let i = 1; i < sorted.length; i++) {
      expect(dot(sorted[i].imagePositionPatient, normal)).toBeGreaterThan(
        dot(sorted[i - 1].imagePositionPatient, normal),
      );
    }
  });
});

describe('7. Thick-slice CT', () => {
  const g = buildSeriesGeometry(
    makeSeries({ sliceSpacing: 5, sliceThickness: 5, numberOfSlices: 40 }),
  );
  it('builds but warns about through-plane coarseness', () => {
    expect(g.verdict).toBe('ok-with-warnings');
    expect(g.issues.some((i) => i.code === 'THICK_SLICES')).toBe(true);
    expect(g.spacing[2]).toBeCloseTo(5, 9);
  });
});

describe('8. Missing slices', () => {
  const gaps = Array.from({ length: 39 }, (_, i) => (i === 20 ? 2.5 : 1.25));
  const frames = makeSeries({ numberOfSlices: 40, gapOverrides: gaps, sliceSpacing: 1.25 });

  it('refuses by default rather than fabricating anatomy', () => {
    const g = buildSeriesGeometry(frames);
    expect(g.verdict).toBe('unsafe');
    const issue = g.issues.find((i) => i.code === 'MISSING_SLICES');
    expect(issue?.severity).toBe('error');
  });

  it('can be allowed explicitly, and then reports how many are absent', () => {
    const g = buildSeriesGeometry(frames, { allowMissingSlices: true });
    expect(g.verdict).toBe('ok-with-warnings');
    expect(g.spacingAnalysis.estimatedMissingCount).toBe(1);
  });
});

describe('9. Irregular slice spacing', () => {
  it('warns for small jitter and still uses the median spacing', () => {
    const gaps = Array.from({ length: 29 }, (_, i) => 1.0 + (i % 2 ? 0.004 : -0.004));
    const g = buildSeriesGeometry(makeSeries({ numberOfSlices: 30, gapOverrides: gaps }));
    expect(g.verdict).not.toBe('unsafe');
    expect(g.spacing[2]).toBeCloseTo(1.0, 2);
  });

  it('refuses when jitter exceeds the safe limit', () => {
    const gaps = Array.from({ length: 29 }, (_, i) => (i === 7 ? 1.4 : 1.0));
    const g = buildSeriesGeometry(makeSeries({ numberOfSlices: 30, gapOverrides: gaps }));
    expect(g.verdict).toBe('unsafe');
    expect(
      g.issues.find((i) => i.code === 'IRREGULAR_SLICE_SPACING')?.severity,
    ).toBe('error');
  });

  it('rejects coincident slices', () => {
    const gaps = Array.from({ length: 9 }, (_, i) => (i === 4 ? 0 : 1));
    const g = buildSeriesGeometry(makeSeries({ numberOfSlices: 10, gapOverrides: gaps }));
    expect(g.verdict).toBe('unsafe');
    expect(g.issues.some((i) => i.code === 'COINCIDENT_SLICES')).toBe(true);
  });
});

describe('Spacing analysis primitives', () => {
  it('computes gaps and the median from real positions', () => {
    const frames = makeSeries({ numberOfSlices: 5, sliceSpacing: 2 });
    const a = analyseSliceSpacing(frames, [0, 0, 1]);
    expect(a.gaps).toHaveLength(4);
    expect(a.medianGap).toBeCloseTo(2, 12);
    expect(a.regular).toBe(true);
  });

  it('measures shear for a tilted stack', () => {
    const frames = makeSeries({
      numberOfSlices: 10,
      sliceSpacing: 1,
      perSliceInPlaneShift: [0, 1, 0],
    });
    const t = analyseGantryTilt(frames, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    expect(t.shearAngleDeg).toBeCloseTo(45, 4);
  });
});

describe('23/24. Series validation and localiser exclusion', () => {
  it('excludes scout images and says so', () => {
    const frames = [...makeSeries({ numberOfSlices: 10 }), makeLocalizer()];
    const result = excludeNonVolumetricFrames(frames);
    expect(result.accepted).toHaveLength(10);
    expect(result.excluded[0].reason).toBe('IMAGE_TYPE_LOCALIZER');
    expect(result.issues[0].code).toBe('LOCALIZER_EXCLUDED');
  });

  it('excludes dose reports and secondary capture', () => {
    const doseReport = {
      ...makeLocalizer(),
      id: 'dose:0',
      sopInstanceUID: 'dose',
      imageType: ['DERIVED', 'PRIMARY'],
      seriesDescription: 'Dose Report',
    };
    const result = excludeNonVolumetricFrames([doseReport]);
    expect(result.accepted).toHaveLength(0);
  });

  it('keeps arterial and venous phases in separate volumes', () => {
    const arterial = makeSeries({ numberOfSlices: 10 }).map((f) => ({
      ...f,
      acquisitionNumber: 1,
    }));
    const venous = makeSeries({ numberOfSlices: 10 }).map((f) => ({
      ...f,
      id: `venous:${f.id}`,
      sopInstanceUID: `v-${f.sopInstanceUID}`,
      acquisitionNumber: 2,
    }));
    const groups = groupFramesForVolume([...arterial, ...venous]);
    expect(groups).toHaveLength(2);
  });

  it('keeps different reconstruction kernels apart', () => {
    const soft = makeSeries({ numberOfSlices: 6 }).map((f) => ({
      ...f,
      convolutionKernel: 'B30f',
    }));
    const bone = makeSeries({ numberOfSlices: 6 }).map((f) => ({
      ...f,
      id: `bone:${f.id}`,
      sopInstanceUID: `b-${f.sopInstanceUID}`,
      convolutionKernel: 'B70f',
    }));
    expect(groupFramesForVolume([...soft, ...bone])).toHaveLength(2);
  });

  it('refuses a volume built from two series', () => {
    const a = makeSeries({ numberOfSlices: 6, seriesInstanceUID: 'S1' });
    const b = makeSeries({ numberOfSlices: 6, seriesInstanceUID: 'S2' }).map((f) => ({
      ...f,
      sopInstanceUID: `b-${f.sopInstanceUID}`,
    }));
    const g = buildSeriesGeometry([...a, ...b]);
    expect(g.verdict).toBe('unsafe');
    expect(g.issues.some((i) => i.code === 'MIXED_SERIES')).toBe(true);
  });

  it('refuses a volume spanning two frames of reference', () => {
    const a = makeSeries({ numberOfSlices: 6 });
    const b = makeSeries({ numberOfSlices: 6, frameOfReferenceUID: 'OTHER' }).map(
      (f) => ({ ...f, sopInstanceUID: `b-${f.sopInstanceUID}` }),
    );
    const g = buildSeriesGeometry([...a, ...b]);
    expect(g.issues.some((i) => i.code === 'MIXED_FRAME_OF_REFERENCE')).toBe(true);
  });

  it('refuses non-parallel images', () => {
    const frames = makeSeries({ numberOfSlices: 6 });
    const tilted = [...frames];
    tilted[3] = {
      ...tilted[3],
      imageOrientationPatient: [1, 0, 0, 0, 0.9848, 0.1736],
    };
    const g = buildSeriesGeometry(tilted);
    expect(g.verdict).toBe('unsafe');
    expect(g.issues.some((i) => i.code === 'INCONSISTENT_ORIENTATION')).toBe(true);
  });

  it('refuses a single image', () => {
    const g = buildSeriesGeometry(makeSeries({ numberOfSlices: 1 }));
    expect(g.issues.some((i) => i.code === 'INSUFFICIENT_SLICES')).toBe(true);
  });

  it('offers the volumetric candidates for explicit selection', () => {
    const { candidates } = prepareCandidateVolumes([
      ...makeSeries({ numberOfSlices: 10 }),
      makeLocalizer(),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].frames).toHaveLength(10);
  });
});

describe('Volume centre', () => {
  it('lands at the geometric centre in patient space', () => {
    const g = buildSeriesGeometry(
      makeSeries({
        rows: 4,
        columns: 4,
        pixelSpacing: [1, 1],
        sliceSpacing: 1,
        numberOfSlices: 5,
        firstSliceOrigin: [0, 0, 0],
      }),
    );
    const c = volumeCentreWorld(g);
    expect(c[0]).toBeCloseTo(1.5, 9);
    expect(c[1]).toBeCloseTo(1.5, 9);
    expect(c[2]).toBeCloseTo(2, 9);
  });
});
