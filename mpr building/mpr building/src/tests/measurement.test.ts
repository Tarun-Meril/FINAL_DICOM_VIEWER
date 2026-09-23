import { describe, expect, it } from 'vitest';
import { buildSeriesGeometry } from '../core/geometry/DICOMGeometry';
import { SpatialTransform } from '../core/geometry/SpatialTransform';
import {
  measureAngleDeg,
  measureEllipseAreaMm2,
  measureLengthMm,
  measurePolygonAreaMm2,
  measureRectangleAreaMm2,
  measurementVisibility,
  type Measurement,
} from '../core/measurement/measurement';
import { viewportPlane } from '../core/crosshair/CrosshairManager';
import { PLANE_CAMERAS, planeScreenRight, MPR_PLANES } from '../core/state/planes';
import { add, scale, type Vec3 } from '../core/math/vec';
import { makeSeries, rotateAboutAxis } from './fixtures/synthetic';

/** Explicit clinical tolerance for the measurement accuracy test. */
const TOLERANCE_MM = 0.01;
const KNOWN_LENGTH_MM = 50;

describe('35. Measurement accuracy against known synthetic geometry', () => {
  const datasets = [
    { label: 'isotropic 0.5mm', pixelSpacing: [0.5, 0.5] as [number, number], sliceSpacing: 0.5 },
    { label: 'anisotropic 0.5/0.5/2.5', pixelSpacing: [0.5, 0.5] as [number, number], sliceSpacing: 2.5 },
    { label: 'anisotropic 0.7/0.7/5', pixelSpacing: [0.7, 0.7] as [number, number], sliceSpacing: 5 },
  ];

  for (const d of datasets) {
    describe(d.label, () => {
      const geometry = buildSeriesGeometry(
        makeSeries({
          rows: 256,
          columns: 256,
          pixelSpacing: d.pixelSpacing,
          sliceSpacing: d.sliceSpacing,
          numberOfSlices: 60,
          firstSliceOrigin: [0, 0, 0],
        }),
      );
      const t = new SpatialTransform(geometry);

      it.each(MPR_PLANES)(
        'measures a known 50 mm structure correctly in the %s plane',
        (plane) => {
          // Build the structure ALONG the plane's screen-right direction, so
          // each plane measures a genuinely different physical axis of the
          // volume rather than repeating the same in-plane distance.
          const start = t.indexToWorld([10, 10, 10]);
          const direction = planeScreenRight(plane);
          const end = add(start, scale(direction, KNOWN_LENGTH_MM));
          expect(measureLengthMm(start, end)).toBeCloseTo(KNOWN_LENGTH_MM, 9);
          expect(
            Math.abs(measureLengthMm(start, end) - KNOWN_LENGTH_MM),
          ).toBeLessThan(TOLERANCE_MM);
        },
      );

      it('measures a structure spanning whole voxels along every axis', () => {
        const spans: Array<[number, number, number]> = [
          [KNOWN_LENGTH_MM / t.spacing[0], 0, 0],
          [0, KNOWN_LENGTH_MM / t.spacing[1], 0],
          [0, 0, KNOWN_LENGTH_MM / t.spacing[2]],
        ];
        for (const span of spans) {
          const a = t.indexToWorld([5, 5, 5]);
          const b = t.indexToWorld([5 + span[0], 5 + span[1], 5 + span[2]]);
          expect(
            Math.abs(measureLengthMm(a, b) - KNOWN_LENGTH_MM),
          ).toBeLessThan(TOLERANCE_MM);
        }
      });

      it('never equates pixels with millimetres', () => {
        // 20 voxels along i is 20 * spacing mm, not 20 mm.
        const a = t.indexToWorld([0, 0, 0]);
        const b = t.indexToWorld([20, 0, 0]);
        expect(measureLengthMm(a, b)).toBeCloseTo(20 * t.spacing[0], 9);
        if (t.spacing[0] !== 1) {
          expect(measureLengthMm(a, b)).not.toBeCloseTo(20, 3);
        }
      });
    });
  }

  it('is unchanged by an oblique acquisition', () => {
    const geometry = buildSeriesGeometry(
      makeSeries({
        rowDirection: rotateAboutAxis([1, 0, 0], [0, 1, 0], 23),
        columnDirection: rotateAboutAxis([0, 1, 0], [0, 1, 0], 23),
        pixelSpacing: [0.6, 0.6],
        sliceSpacing: 1.5,
        numberOfSlices: 40,
      }),
    );
    const t = new SpatialTransform(geometry);
    const a = t.indexToWorld([10, 10, 10]);
    const b = t.indexToWorld([10 + KNOWN_LENGTH_MM / 0.6, 10, 10]);
    expect(Math.abs(measureLengthMm(a, b) - KNOWN_LENGTH_MM)).toBeLessThan(TOLERANCE_MM);
  });
});

describe('21. Angle and ROI measurement', () => {
  it('measures a right angle', () => {
    expect(measureAngleDeg([1, 0, 0], [0, 0, 0], [0, 1, 0])).toBeCloseTo(90, 9);
  });

  it('measures a 30 degree angle', () => {
    const a: Vec3 = [1, 0, 0];
    const b = rotateAboutAxis(a, [0, 0, 1], 30);
    expect(measureAngleDeg(a, [0, 0, 0], b)).toBeCloseTo(30, 9);
  });

  it('measures a rectangle area in mm^2', () => {
    const area = measureRectangleAreaMm2([0, 0, 0], [20, 10, 0], [1, 0, 0], [0, 1, 0]);
    expect(area).toBeCloseTo(200, 9);
  });

  it('measures an ellipse area in mm^2', () => {
    const area = measureEllipseAreaMm2([0, 0, 0], [20, 10, 0], [1, 0, 0], [0, 1, 0]);
    expect(area).toBeCloseTo(Math.PI * 10 * 5, 9);
  });

  it('measures a planar polygon area in any orientation', () => {
    const square: Vec3[] = [
      [0, 0, 0],
      [10, 0, 0],
      [10, 0, 10],
      [0, 0, 10],
    ];
    expect(measurePolygonAreaMm2(square)).toBeCloseTo(100, 9);
  });
});

describe('22. Measurements are stored in world space and survive plane changes', () => {
  const reference: Vec3 = [30, -20, 15];

  const measurement: Measurement = {
    id: 'm1',
    kind: 'length',
    points: [
      [30, -20, 15],
      [70, -20, 15],
    ],
    planeNormal: PLANE_CAMERAS.axial.viewPlaneNormal,
    createdOnViewport: 'MPR_AXIAL',
    createdAt: 0,
  };

  it('keeps its length regardless of which plane is displayed', () => {
    expect(measureLengthMm(measurement.points[0], measurement.points[1])).toBeCloseTo(40, 9);
  });

  it('is shown on the plane that actually contains it', () => {
    const axialPlane = viewportPlane('axial', reference);
    expect(measurementVisibility(measurement, axialPlane, 1).visible).toBe(true);
  });

  it('is hidden once the displayed slice moves away from it', () => {
    const movedPlane = viewportPlane('axial', [30, -20, 45]);
    const v = measurementVisibility(measurement, movedPlane, 1);
    expect(v.visible).toBe(false);
    expect(v.distanceMm).toBeCloseTo(30, 9);
  });

  it('reappears inside a thick slab that contains it', () => {
    const movedPlane = viewportPlane('axial', [30, -20, 25]);
    expect(measurementVisibility(measurement, movedPlane, 30).visible).toBe(true);
  });
});
