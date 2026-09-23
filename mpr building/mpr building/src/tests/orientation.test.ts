import { describe, expect, it } from 'vitest';
import {
  directionToAnatomicalLabel,
  isNonMirroredBasis,
  screenRightFromCamera,
  viewportOrientationLabels,
  describePatientPosition,
} from '../core/geometry/orientation';
import { MPR_PLANES, PLANE_CAMERAS, planeScreenRight } from '../core/state/planes';
import { rotateAboutAxis } from './fixtures/synthetic';

describe('4/19. Anatomical labels are derived, never hard-coded', () => {
  it('maps the LPS axes to the correct letters', () => {
    expect(directionToAnatomicalLabel([1, 0, 0])).toBe('L');
    expect(directionToAnatomicalLabel([-1, 0, 0])).toBe('R');
    expect(directionToAnatomicalLabel([0, 1, 0])).toBe('P');
    expect(directionToAnatomicalLabel([0, -1, 0])).toBe('A');
    expect(directionToAnatomicalLabel([0, 0, 1])).toBe('S');
    expect(directionToAnatomicalLabel([0, 0, -1])).toBe('I');
  });

  it('describes an oblique direction with ordered letters', () => {
    const v = rotateAboutAxis([0, 0, 1], [1, 0, 0], 30); // mostly superior, some anterior
    expect(directionToAnatomicalLabel(v)).toBe('SA');
  });

  it('labels the axial viewport R/L/A/P correctly (radiological convention)', () => {
    const labels = viewportOrientationLabels(
      PLANE_CAMERAS.axial.viewUp,
      planeScreenRight('axial'),
    );
    expect(labels.top).toBe('A');
    expect(labels.bottom).toBe('P');
    expect(labels.right).toBe('L');
    expect(labels.left).toBe('R');
  });

  it('labels the coronal viewport S/I/R/L correctly', () => {
    const labels = viewportOrientationLabels(
      PLANE_CAMERAS.coronal.viewUp,
      planeScreenRight('coronal'),
    );
    expect(labels.top).toBe('S');
    expect(labels.bottom).toBe('I');
    expect(labels.right).toBe('L');
    expect(labels.left).toBe('R');
  });

  it('labels the sagittal viewport S/I/A/P correctly and is not mirrored', () => {
    const labels = viewportOrientationLabels(
      PLANE_CAMERAS.sagittal.viewUp,
      planeScreenRight('sagittal'),
    );
    expect(labels.top).toBe('S');
    expect(labels.bottom).toBe('I');
    expect(labels.left).toBe('A');
    expect(labels.right).toBe('P');
  });

  it('uses a right-handed, non-mirrored basis in every viewport', () => {
    for (const plane of MPR_PLANES) {
      const { viewUp, viewPlaneNormal } = PLANE_CAMERAS[plane];
      const right = screenRightFromCamera(viewUp, viewPlaneNormal);
      expect(isNonMirroredBasis(right, viewUp, viewPlaneNormal)).toBe(true);
    }
  });

  it('detects a mirrored basis', () => {
    const { viewUp, viewPlaneNormal } = PLANE_CAMERAS.axial;
    const right = screenRightFromCamera(viewUp, viewPlaneNormal);
    const flipped: [number, number, number] = [-right[0], -right[1], -right[2]];
    expect(isNonMirroredBasis(flipped, viewUp, viewPlaneNormal)).toBe(false);
  });

  it('decodes Patient Position for the diagnostic panel', () => {
    expect(describePatientPosition('HFS')).toBe('Head First–Supine');
    expect(describePatientPosition('FFP')).toBe('Feet First–Prone');
    expect(describePatientPosition(undefined)).toBe('Unknown');
  });
});
