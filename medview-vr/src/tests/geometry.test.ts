import { describe, it, expect } from 'vitest';
import {
  analyzeGeometry, sliceNormal, sliceCoordinate, anatomicalLabel, orientationCode, orientationConfidence,
} from '@/dicom/geometry';
import { ErrorCode } from '@/core/errors';
import { axialStack, makeInstance } from './fixtures';

describe('slice normal and ordering', () => {
  it('computes the normal as cross(row, column)', () => {
    expect(sliceNormal([1, 0, 0, 0, 1, 0])).toEqual([0, 0, 1]);
    expect(sliceNormal([0, 1, 0, 0, 0, -1])).toEqual([-1, 0, 0]);
  });

  it('projects Image Position (Patient) onto the normal', () => {
    expect(sliceCoordinate([3, 7, 11], [0, 0, 1])).toBe(11);
    expect(sliceCoordinate([3, 7, 11], [1, 0, 0])).toBe(3);
  });

  it('orders slices by physical position, not by filename or InstanceNumber', () => {
    // Deliberately hand them over in the wrong order with reversed instance numbers.
    const zs = [30, 10, 20, 0];
    const instances = zs.map((z, i) => makeInstance({
      fileId: `zzz-${String(100 - i)}.dcm`,
      instanceNumber: 100 - i,
      imagePositionPatient: [0, 0, z],
    }));
    const a = analyzeGeometry(instances);
    expect(a.slices.map((s) => s.coordinate)).toEqual([0, 10, 20, 30]);
    expect(a.geometry?.origin).toEqual([0, 0, 0]);
  });
});

describe('spacing derivation', () => {
  it('measures spacing from positions and ignores SliceThickness', () => {
    // SliceThickness deliberately disagrees with the real 2 mm spacing.
    const a = analyzeGeometry(axialStack([0, 2, 4, 6, 8], { sliceThickness: 5 }));
    expect(a.geometry?.spacing[2]).toBeCloseTo(2, 9);
    expect(a.geometry?.spacingSource).toBe('measured');
    expect(a.strategy).toBe('regular');
  });

  it('maps DICOM PixelSpacing [betweenRows, betweenColumns] to [i, j] spacing', () => {
    const a = analyzeGeometry(axialStack([0, 1], { pixelSpacing: [0.6, 0.9] }));
    // i runs along columns -> PixelSpacing[1]; j runs along rows -> PixelSpacing[0].
    expect(a.geometry?.spacing[0]).toBe(0.9);
    expect(a.geometry?.spacing[1]).toBe(0.6);
  });

  it('flags irregular spacing and switches to the resampling strategy', () => {
    const a = analyzeGeometry(axialStack([0, 1, 2.6, 3.6, 4.6]));
    expect(a.issues.some((i) => i.code === ErrorCode.GEOMETRY_IRREGULAR_SPACING)).toBe(true);
    expect(a.strategy).toBe('resample-irregular');
  });

  it('detects duplicate slice positions', () => {
    const a = analyzeGeometry(axialStack([0, 1, 1, 2]));
    expect(a.stats.duplicatePositions).toBe(1);
    expect(a.issues.some((i) => i.code === ErrorCode.GEOMETRY_DUPLICATE_POSITIONS)).toBe(true);
  });

  it('detects missing slices from a doubled gap', () => {
    const a = analyzeGeometry(axialStack([0, 1, 2, 4, 5]));
    expect(a.stats.suspectedMissingSlices).toBe(1);
    expect(a.issues.some((i) => i.code === ErrorCode.GEOMETRY_MISSING_SLICES)).toBe(true);
  });

  it('falls back to SpacingBetweenSlices for a single slice and says so', () => {
    const a = analyzeGeometry([makeInstance({ spacingBetweenSlices: 3 })]);
    expect(a.geometry?.spacing[2]).toBe(3);
    expect(a.geometry?.spacingSource).toBe('spacing-between-slices');
  });
});

describe('geometry rejection', () => {
  it('refuses to build a volume from mixed orientations', () => {
    const instances = [
      ...axialStack([0, 1]),
      makeInstance({ imageOrientationPatient: [1, 0, 0, 0, 0, -1], imagePositionPatient: [0, 0, 2] }),
    ];
    const a = analyzeGeometry(instances);
    expect(a.geometry).toBeNull();
    expect(a.strategy).toBe('reject');
    const issue = a.issues.find((i) => i.code === ErrorCode.GEOMETRY_INCONSISTENT_ORIENTATION);
    expect(issue?.severity).toBe('fatal');
    expect(issue?.message).toMatch(/inconsistent orientation/);
  });

  it('refuses to build a volume from mixed matrices', () => {
    const a = analyzeGeometry([...axialStack([0, 1]), makeInstance({ rows: 256, columns: 256, imagePositionPatient: [0, 0, 2] })]);
    expect(a.geometry).toBeNull();
    expect(a.issues.some((i) => i.code === ErrorCode.GEOMETRY_MIXED_MATRIX)).toBe(true);
  });

  it('reports missing position/orientation rather than guessing', () => {
    const a = analyzeGeometry([makeInstance({ imagePositionPatient: undefined })]);
    expect(a.geometry).toBeNull();
    expect(a.issues[0].code).toBe(ErrorCode.GEOMETRY_MISSING);
  });
});

describe('gantry tilt', () => {
  it('detects a sheared stack and selects shear correction', () => {
    // Slices advance 1 mm in z and 0.2 mm in y: an ~11 degree tilt.
    const instances = [0, 1, 2, 3, 4].map((k) => makeInstance({
      imagePositionPatient: [0, k * 0.2, k],
      gantryDetectorTilt: 11.3,
    }));
    const a = analyzeGeometry(instances);
    expect(a.stats.stackShearDeg).toBeGreaterThan(10);
    expect(a.strategy).toBe('shear-correct');
    expect(a.issues.some((i) => i.code === ErrorCode.GEOMETRY_GANTRY_TILT)).toBe(true);
  });

  it('reports no shear for an untilted stack', () => {
    const a = analyzeGeometry(axialStack([0, 1, 2, 3]));
    expect(a.stats.stackShearDeg).toBeLessThan(1e-6);
    expect(a.strategy).toBe('regular');
  });
});

describe('anatomical orientation (LPS)', () => {
  it('labels the cardinal directions', () => {
    expect(anatomicalLabel([1, 0, 0])).toBe('L');
    expect(anatomicalLabel([-1, 0, 0])).toBe('R');
    expect(anatomicalLabel([0, 1, 0])).toBe('P');
    expect(anatomicalLabel([0, -1, 0])).toBe('A');
    expect(anatomicalLabel([0, 0, 1])).toBe('S');
    expect(anatomicalLabel([0, 0, -1])).toBe('I');
  });

  it('gives LPS for an identity axial acquisition', () => {
    const a = analyzeGeometry(axialStack([0, 1, 2]));
    const g = a.geometry!;
    expect(orientationCode(g.iAxis, g.jAxis, g.kAxis)).toBe('LPS');
    expect(orientationConfidence(g.iAxis, g.jAxis, g.kAxis).confident).toBe(true);
  });

  it('never produces a left-handed basis', () => {
    for (const iop of [
      [1, 0, 0, 0, 1, 0], [0, 1, 0, 0, 0, -1], [1, 0, 0, 0, 0, -1],
      [0.7071, 0.7071, 0, -0.7071, 0.7071, 0],
    ]) {
      const a = analyzeGeometry([makeInstance({ imageOrientationPatient: iop as never })]);
      expect(a.geometry?.handedness).toBe(1);
    }
  });

  it('warns when the acquisition is strongly oblique', () => {
    const c = orientationConfidence([0.6, 0.6, 0.53], [-0.7, 0.7, 0], [0.37, 0.37, -0.85]);
    expect(c.confident).toBe(false);
  });
});
