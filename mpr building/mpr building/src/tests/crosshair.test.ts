import { describe, expect, it } from 'vitest';
import { buildSeriesGeometry, volumeCentreWorld } from '../core/geometry/DICOMGeometry';
import { SpatialTransform } from '../core/geometry/SpatialTransform';
import {
  crosshairConsistencyErrorMm,
  focalPointForReference,
  referenceLinesForViewport,
  reformatPitchMm,
  stepReferencePoint,
  triplePlaneIntersection,
  viewportPlane,
} from '../core/crosshair/CrosshairManager';
import { MPR_PLANES, PLANE_CAMERAS, planeScreenRight } from '../core/state/planes';
import { distance, dot, sub, type Vec3 } from '../core/math/vec';
import { makeSeries, rotateAboutAxis } from './fixtures/synthetic';
import {
  clampReferenceToVolume,
  resolveNavigation,
  sliceInfoForPlane,
} from '../core/state/SliceNavigation';

const anisotropic = buildSeriesGeometry(
  makeSeries({
    rows: 512,
    columns: 512,
    pixelSpacing: [0.7, 0.7],
    sliceSpacing: 2.5,
    numberOfSlices: 120,
    firstSliceOrigin: [-179.65, -179.65, -150],
  }),
);

describe('34. Crosshair accuracy — numerical, not visual', () => {
  const referencePoint: Vec3 = [120.4, -45.2, 80.7];

  it('the three displayed planes meet exactly at the reference point', () => {
    const planes = MPR_PLANES.map((p) => viewportPlane(p, referencePoint)) as [
      ReturnType<typeof viewportPlane>,
      ReturnType<typeof viewportPlane>,
      ReturnType<typeof viewportPlane>,
    ];
    const intersection = triplePlaneIntersection(planes);
    expect(intersection).not.toBeNull();
    // Sub-micron agreement: far below any clinically meaningful error.
    expect(distance(intersection as Vec3, referencePoint)).toBeLessThan(1e-9);
  });

  it('no plane is offset from the reference point', () => {
    const displayed = {
      axial: viewportPlane('axial', referencePoint),
      coronal: viewportPlane('coronal', referencePoint),
      sagittal: viewportPlane('sagittal', referencePoint),
    };
    expect(crosshairConsistencyErrorMm(referencePoint, displayed)).toBeLessThan(1e-12);
  });

  it('round-trips through the volume index space without drift', () => {
    const t = new SpatialTransform(anisotropic);
    const centre = volumeCentreWorld(anisotropic);
    const index = t.worldToIndex(centre);
    const back = t.indexToWorld(index);
    expect(distance(back, centre)).toBeLessThan(1e-9);
  });

  it('stays exact for an oblique, anisotropic volume', () => {
    const oblique = buildSeriesGeometry(
      makeSeries({
        rowDirection: rotateAboutAxis([1, 0, 0], [0, 1, 0], 17),
        columnDirection: rotateAboutAxis([0, 1, 0], [0, 1, 0], 17),
        pixelSpacing: [0.5, 0.9],
        sliceSpacing: 3.2,
        numberOfSlices: 45,
      }),
    );
    const t = new SpatialTransform(oblique);
    for (const idx of [
      [0, 0, 0],
      [10.5, 200.25, 7.75],
      [511, 511, 44],
    ] as const) {
      const world = t.indexToWorld(idx);
      const back = t.worldToIndex(world);
      expect(back[0]).toBeCloseTo(idx[0], 8);
      expect(back[1]).toBeCloseTo(idx[1], 8);
      expect(back[2]).toBeCloseTo(idx[2], 8);
    }
  });
});

describe('9/30. Synchronisation moves the slice only', () => {
  it('preserves in-plane pan when the crosshair moves', () => {
    const currentFocal: Vec3 = [10, 20, 30];
    const reference: Vec3 = [55, -12, 77];
    for (const plane of MPR_PLANES) {
      const next = focalPointForReference(plane, reference, currentFocal, false);
      const n = PLANE_CAMERAS[plane].viewPlaneNormal;
      // The component along the normal must now match the reference point...
      expect(dot(next, n)).toBeCloseTo(dot(reference, n), 10);
      // ...and the in-plane component must be untouched.
      const inPlane = sub(next, currentFocal);
      const right = planeScreenRight(plane);
      expect(dot(inPlane, right)).toBeCloseTo(0, 10);
      expect(dot(inPlane, PLANE_CAMERAS[plane].viewUp)).toBeCloseTo(0, 10);
    }
  });

  it('recentres exactly on the point when jump-to-point is requested', () => {
    const next = focalPointForReference('coronal', [1, 2, 3], [9, 9, 9], true);
    expect(next).toEqual([1, 2, 3]);
  });
});

describe('10. Reference lines are true plane intersections', () => {
  const reference: Vec3 = [12, -30, 44];
  const rect = { centre: reference, halfWidthMm: 150, halfHeightMm: 150 };

  it('draws the other two planes in every viewport', () => {
    for (const plane of MPR_PLANES) {
      const segments = referenceLinesForViewport(plane, reference, rect);
      expect(segments).toHaveLength(2);
      for (const s of segments) {
        // Every point of a reference line lies in BOTH planes.
        const own = viewportPlane(plane, reference);
        const other = viewportPlane(s.sourcePlane, reference);
        for (const p of [s.start, s.end]) {
          expect(Math.abs(dot(sub(p, own.point), own.normal))).toBeLessThan(1e-9);
          expect(Math.abs(dot(sub(p, other.point), other.normal))).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('places the coronal line horizontally across the axial view', () => {
    const segments = referenceLinesForViewport('axial', reference, rect);
    const coronalLine = segments.find((s) => s.sourcePlane === 'coronal');
    expect(coronalLine).toBeDefined();
    const dir = sub(coronalLine!.end, coronalLine!.start);
    const right = planeScreenRight('axial');
    const up = PLANE_CAMERAS.axial.viewUp;
    expect(Math.abs(dot(dir, up))).toBeLessThan(1e-9);
    expect(Math.abs(dot(dir, right))).toBeGreaterThan(1);
  });

  it('moves the lines with the reference point, not with a percentage', () => {
    const a = referenceLinesForViewport('sagittal', reference, rect)[0];
    const moved: Vec3 = [reference[0], reference[1] + 25, reference[2]];
    const b = referenceLinesForViewport(
      'sagittal',
      moved,
      { ...rect, centre: moved },
    )[0];
    expect(distance(a.start, b.start)).toBeGreaterThan(1);
  });

  it('returns nothing when the intersection is outside the visible region', () => {
    const farRect = {
      centre: [10000, 10000, 10000] as Vec3,
      halfWidthMm: 10,
      halfHeightMm: 10,
    };
    expect(referenceLinesForViewport('axial', reference, farRect)).toHaveLength(0);
  });
});

describe('31/32. Slice navigation uses real patient-space values', () => {
  const t = new SpatialTransform(anisotropic);
  const centre = volumeCentreWorld(anisotropic);

  it('reports the true reformat pitch per plane', () => {
    const axes = { i: t.rowDirection, j: t.columnDirection, k: t.sliceNormal };
    expect(reformatPitchMm('axial', axes, t.spacing)).toBeCloseTo(2.5, 9);
    expect(reformatPitchMm('coronal', axes, t.spacing)).toBeCloseTo(0.7, 9);
    expect(reformatPitchMm('sagittal', axes, t.spacing)).toBeCloseTo(0.7, 9);
  });

  it('reports slice index, total and physical position', () => {
    const info = sliceInfoForPlane('axial', centre, t, 0);
    expect(info.total).toBe(120);
    // 120 slices: the centre falls between slice 60 and 61.
    expect([60, 61]).toContain(info.index);
    expect(info.pitchMm).toBeCloseTo(2.5, 9);
    expect(info.positionMm).toBeCloseTo(dot(centre, PLANE_CAMERAS.axial.viewPlaneNormal), 9);
  });

  it('steps by exactly one reformat pitch', () => {
    const next = stepReferencePoint('axial', centre, 1, 2.5);
    expect(distance(next, centre)).toBeCloseTo(2.5, 9);
  });

  it('resolves first/last/centre navigation from the real slice count', () => {
    const info = sliceInfoForPlane('axial', centre, t, 0);
    expect(resolveNavigation({ type: 'first' }, info)).toBe(1 - info.index);
    expect(resolveNavigation({ type: 'last' }, info)).toBe(info.total - info.index);
    expect(resolveNavigation({ type: 'page', pages: 1 }, info)).toBe(10);
  });

  it('never navigates outside the volume', () => {
    const far = stepReferencePoint('axial', centre, 10_000, 2.5);
    const clamped = clampReferenceToVolume(far, t);
    expect(t.isInsideVolume(clamped)).toBe(true);
  });
});
