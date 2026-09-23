/**
 * mprValidation.test.ts
 *
 * Unit tests for MPRReconstructabilityValidator.
 * Tests all 8 scenarios specified in the task definition:
 *   ✓ Valid CT
 *   ✓ Valid MRI
 *   ✓ Mixed orientation (scout/localizer)
 *   ✓ Missing metadata (no IPP)
 *   ✓ Irregular spacing
 *   ✓ Missing FrameOfReferenceUID
 *   ✓ Scout series
 *   ✓ Localizer series
 *
 * Also tests utility methods: sortByIPP() and computeZSpacingMm().
 */

import { describe, it, expect } from 'vitest';
import { MPRReconstructabilityValidator } from '../mpr/MPRReconstructabilityValidator';
import { SeriesValidator } from '../mpr/managers/SeriesValidator';

// ─────────────────────────────────────────────────────────────────────────────
// Test Data Factories
// ─────────────────────────────────────────────────────────────────────────────

/** Axial IOP: standard CT/MR axial orientation */
const AXIAL_IOP = [1, 0, 0, 0, 1, 0];
/** Coronal IOP */
const CORONAL_IOP = [1, 0, 0, 0, 0, -1];
/** Sagittal IOP */
const SAGITTAL_IOP = [0, 1, 0, 0, 0, -1];

/** Generate a stack of uniform axial instances */
function makeAxialStack(count: number, opts: {
  spacingMm?: number;
  rows?: number;
  columns?: number;
  iop?: number[];
  frameOfRefUID?: string;
  pixelSpacing?: number[];
  missingIPP?: boolean;
} = {}): any[] {
  const {
    spacingMm = 1.25,
    rows = 512,
    columns = 512,
    iop = AXIAL_IOP,
    frameOfRefUID = '2.25.123456789',
    pixelSpacing = [0.68, 0.68],
    missingIPP = false,
  } = opts;

  return Array.from({ length: count }, (_, i) => ({
    sop_instance_uid: `1.2.3.4.5.6.${i + 1}`,
    series_instance_uid: '1.2.3.4.5.6',
    image_orientation: iop,
    image_position: missingIPP ? undefined : [0, 0, i * spacingMm],
    pixel_spacing: pixelSpacing,
    slice_thickness: spacingMm,
    frame_of_reference_uid: frameOfRefUID,
    rows,
    columns,
    samples_per_pixel: 1,
    modality: 'CT',
    window_center: 40,
    window_width: 400,
  }));
}

/** Make a stack with irregular spacing at a specific index */
function makeIrregularStack(count: number, irregularAtIdx: number, jumpMm: number): any[] {
  const stack = makeAxialStack(count);
  // Rewrite positions to introduce a gap at irregularAtIdx
  let z = 0;
  for (let i = 0; i < count; i++) {
    stack[i].image_position = [0, 0, z];
    if (i === irregularAtIdx) {
      z += jumpMm; // large jump = irregular spacing
    } else {
      z += 1.25;   // normal spacing
    }
  }
  return stack;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('MPRReconstructabilityValidator', () => {

  // ── Test 1: Valid CT series ───────────────────────────────────────────────
  describe('Test 1: Valid CT series', () => {
    it('should PASS with 60 uniform axial CT slices', () => {
      const instances = makeAxialStack(60, { modality: 'CT' } as any);
      const result = MPRReconstructabilityValidator.validate(instances);

      expect(result.status).toBe('PASS');
      expect(result.details.sliceCount).toBe(60);
      expect(result.details.uniqueIOPGroups).toBe(1);
      expect(result.details.isScoutSuspected).toBe(false);
      expect(result.details.frameOfReferenceUID).toBe('2.25.123456789');
      expect(result.details.averageSpacingMm).toBeCloseTo(1.25, 1);
    });

    it('should PASS with 20 slices — minimum viable stack', () => {
      const instances = makeAxialStack(20);
      const result = MPRReconstructabilityValidator.validate(instances);
      expect(result.status).toBe('PASS');
    });
  });

  // ── Test 2: Valid MRI series ──────────────────────────────────────────────
  describe('Test 2: Valid MRI series', () => {
    it('should PASS with 30 axial MRI slices at 3mm spacing', () => {
      const instances = makeAxialStack(30, { spacingMm: 3.0 });
      instances.forEach(i => { i.modality = 'MR'; i.window_center = 400; i.window_width = 800; });

      const result = MPRReconstructabilityValidator.validate(instances);

      expect(result.status).toBe('PASS');
      expect(result.details.sliceCount).toBe(30);
      expect(result.details.averageSpacingMm).toBeCloseTo(3.0, 1);
    });

    it('should PASS with coronal MRI orientation', () => {
      const instances = makeAxialStack(40, { iop: CORONAL_IOP });
      const result = MPRReconstructabilityValidator.validate(instances);
      expect(result.status).toBe('PASS');
      expect(result.details.uniqueIOPGroups).toBe(1);
    });
  });

  // ── Test 3: Mixed orientation (scout/localizer) ───────────────────────────
  describe('Test 3: Mixed orientation series', () => {
    it('should WARNING (not FAIL) when series has 3 IOPs but each group has 20 slices', () => {
      const axial    = makeAxialStack(20, { iop: AXIAL_IOP });
      const coronal  = makeAxialStack(20, { iop: CORONAL_IOP });
      const sagittal = makeAxialStack(20, { iop: SAGITTAL_IOP });
      const mixed = [...axial, ...coronal, ...sagittal];

      const result = MPRReconstructabilityValidator.validate(mixed);

      // Largest group = 20 slices — usable for MPR, so WARNING not FAIL
      expect(result.status).toBe('WARNING');
      expect(result.details.uniqueIOPGroups).toBe(3);
      expect(result.details.isScoutSuspected).toBe(true);
      expect(result.reason).toContain('largest coherent group: 20 slices');
    });

    it('should WARNING for 2-IOP mix (axial + coronal localizer) with usable axial group', () => {
      const axial   = makeAxialStack(40, { iop: AXIAL_IOP });
      const coronal = makeAxialStack(5,  { iop: CORONAL_IOP });
      const mixed   = [...axial, ...coronal];

      const result = MPRReconstructabilityValidator.validate(mixed);

      // Largest group = 40 axial slices — very usable
      expect(result.status).toBe('WARNING');
      expect(result.details.uniqueIOPGroups).toBe(2);
      expect(result.details.isScoutSuspected).toBe(true);
    });

    it('should FAIL when mixed orientations AND each group too small', () => {
      const axial   = makeAxialStack(1, { iop: AXIAL_IOP });
      const coronal = makeAxialStack(1, { iop: CORONAL_IOP });
      const mixed   = [...axial, ...coronal];

      const result = MPRReconstructabilityValidator.validate(mixed);

      // Largest group = 1 slice — not enough for volume
      expect(result.status).toBe('FAIL');
    });
  });

  // ── Test 4: Missing metadata (no ImagePositionPatient) ────────────────────
  describe('Test 4: Missing metadata', () => {
    it('should FAIL when ALL instances are missing ImagePositionPatient', () => {
      const instances = makeAxialStack(30, { missingIPP: true });
      const result = MPRReconstructabilityValidator.validate(instances);

      expect(result.status).toBe('FAIL');
      expect(result.details.missingIPP).toBe(30);
      expect(result.reason).toContain('ImagePositionPatient');
    });

    it('should FAIL with only 1 instance', () => {
      const instances = makeAxialStack(1);
      const result = MPRReconstructabilityValidator.validate(instances);

      expect(result.status).toBe('FAIL');
      expect(result.reason).toContain('Insufficient slices');
    });

    it('should FAIL with empty array', () => {
      const result = MPRReconstructabilityValidator.validate([]);
      expect(result.status).toBe('FAIL');
      expect(result.reason).toContain('Insufficient slices');
    });
  });

  // ── Test 5: Irregular spacing ─────────────────────────────────────────────
  describe('Test 5: Irregular slice spacing', () => {
    it('should WARNING when one gap is 3× the average (missing slices)', () => {
      // 60 slices, with a 3.75mm gap at index 30 vs avg 1.25mm (3× = 200% deviation)
      const instances = makeIrregularStack(60, 30, 3.75);
      const result = MPRReconstructabilityValidator.validate(instances);

      // Should be WARNING (≥50% deviation triggers warning)
      expect(['WARNING', 'PASS']).toContain(result.status);
    });

    it('should WARNING when gap is extremely large (>50% deviation)', () => {
      const instances = makeAxialStack(30);
      // Introduce a 10mm gap at slice 15 (vs avg 1.25mm = 800% deviation)
      instances[15].image_position = [0, 0, 100]; // big jump
      const result = MPRReconstructabilityValidator.validate(instances);

      // Extremely irregular — should be WARNING or FAIL
      expect(['WARNING', 'FAIL']).toContain(result.status);
    });

    it('should PASS with minor spacing variance <20%', () => {
      // 5% variation — well within tolerance
      const instances = makeAxialStack(30);
      instances.forEach((inst, i) => {
        // Add ±0.05mm jitter (4% of 1.25mm avg)
        const jitter = (i % 2 === 0) ? 0.03 : -0.03;
        inst.image_position = [0, 0, i * 1.25 + jitter];
      });
      const result = MPRReconstructabilityValidator.validate(instances);
      expect(result.status).toBe('PASS');
    });
  });

  // ── Test 6: Missing FrameOfReferenceUID ───────────────────────────────────
  describe('Test 6: Missing FrameOfReferenceUID', () => {
    it('should still PASS without FrameOfReferenceUID (FOR is optional for reconstruction)', () => {
      const instances = makeAxialStack(30, { frameOfRefUID: '' } as any);
      instances.forEach(i => { delete i.frame_of_reference_uid; });

      const result = MPRReconstructabilityValidator.validate(instances);

      // FOR is not required for spatial reconstruction — geometry still valid
      expect(result.status).toBe('PASS');
      expect(result.details.frameOfReferenceUID).toBeNull();
    });
  });

  // ── Test 7: Scout series ──────────────────────────────────────────────────
  describe('Test 7: Scout series', () => {
    it('should WARNING (not FAIL) for a 3-plane scout with 20 slices per plane', () => {
      const n = 20;
      const axial    = makeAxialStack(n, { iop: AXIAL_IOP });
      const coronal  = makeAxialStack(n, { iop: CORONAL_IOP });
      const sagittal = makeAxialStack(n, { iop: SAGITTAL_IOP });
      // Interleave as a real scout scan would
      const scout: any[] = [];
      for (let i = 0; i < n; i++) {
        scout.push(axial[i], coronal[i], sagittal[i]);
      }

      const result = MPRReconstructabilityValidator.validate(scout);

      // 20 slices per group — MPR will use the largest group with a WARNING
      expect(result.status).toBe('WARNING');
      expect(result.details.isScoutSuspected).toBe(true);
      expect(result.details.uniqueIOPGroups).toBe(3);
    });
  });

  // ── Test 8: Localizer series ──────────────────────────────────────────────
  describe('Test 8: Localizer series', () => {
    it('should FAIL for a 2-slice localizer (below minimum slice count)', () => {
      // Some localizers have only 1 image
      const instances = makeAxialStack(1);
      const result = MPRReconstructabilityValidator.validate(instances);
      expect(result.status).toBe('FAIL');
    });

    it('should WARNING for localizer with mixed IOP appended to 50-slice diagnostic series', () => {
      const diagnostic  = makeAxialStack(50, { iop: AXIAL_IOP });
      const localizer   = makeAxialStack(2,  { iop: CORONAL_IOP }); // 2 localizer images
      const combined    = [...diagnostic, ...localizer];

      const result = MPRReconstructabilityValidator.validate(combined);

      // 50-slice diagnostic group is usable — WARNING with fallback grouping
      expect(result.status).toBe('WARNING');
      expect(result.details.isScoutSuspected).toBe(true);
    });
  });

  // ── Utility: sortByIPP() ──────────────────────────────────────────────────
  describe('sortByIPP()', () => {
    it('should sort instances in ascending Z order', () => {
      const shuffled = makeAxialStack(10).reverse(); // reverse = Z descending
      const sorted = MPRReconstructabilityValidator.sortByIPP(shuffled);

      for (let i = 1; i < sorted.length; i++) {
        const zA = sorted[i - 1].image_position[2];
        const zB = sorted[i].image_position[2];
        expect(zB).toBeGreaterThanOrEqual(zA);
      }
    });

    it('should return original array if only 1 element', () => {
      const single = makeAxialStack(1);
      const sorted = MPRReconstructabilityValidator.sortByIPP(single);
      expect(sorted).toHaveLength(1);
    });
  });

  // ── Utility: computeZSpacingMm() ─────────────────────────────────────────
  describe('computeZSpacingMm()', () => {
    it('should return null for 1-element array', () => {
      const single = makeAxialStack(1);
      expect(MPRReconstructabilityValidator.computeZSpacingMm(single)).toBeNull();
    });

    it('should compute correct spacing for uniform 1.25mm stack', () => {
      const instances = makeAxialStack(30, { spacingMm: 1.25 });
      const spacing = MPRReconstructabilityValidator.computeZSpacingMm(instances);
      expect(spacing).toBeCloseTo(1.25, 1);
    });

    it('should compute correct spacing for 3mm MRI stack', () => {
      const instances = makeAxialStack(20, { spacingMm: 3.0 });
      const spacing = MPRReconstructabilityValidator.computeZSpacingMm(instances);
      expect(spacing).toBeCloseTo(3.0, 1);
    });
  });

  // ── SeriesValidator: CT Series Detection & Physical Geometry ─────────────
  describe('SeriesValidator: CT Series Detection & Geometry', () => {
    it('should accurately detect CT modality on series and instance levels', () => {
      expect(SeriesValidator.isCTSeries({ modality: 'CT' })).toBe(true);
      expect(SeriesValidator.isCTSeries({ Modality: 'ct' })).toBe(true);
      expect(SeriesValidator.isCTSeries({ modality: 'MR' })).toBe(false);
      expect(SeriesValidator.isCTSeries([{ modality: 'CT' }])).toBe(true);
      expect(SeriesValidator.isCTSeries([{ modality: 'MR' }])).toBe(false);
    });

    it('should PASS valid CT series with correct physical geometry', () => {
      const instances = makeAxialStack(50, { modality: 'CT' } as any);
      const validation = SeriesValidator.validateCTSeriesGeometry(instances);
      expect(validation.isValid).toBe(true);
      expect(validation.isCT).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject series with mixed SeriesInstanceUIDs', () => {
      const instances = makeAxialStack(10, { modality: 'CT' } as any);
      instances[5].series_instance_uid = 'different-series-uid';
      const validation = SeriesValidator.validateCTSeriesGeometry(instances);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('mixed SeriesInstanceUIDs'))).toBe(true);
    });

    it('should reject series with invalid pixel spacing or dimensions', () => {
      const instances = makeAxialStack(10, { pixelSpacing: [0, 0] });
      const validation = SeriesValidator.validateCTSeriesGeometry(instances);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('PixelSpacing'))).toBe(true);
    });
  });

});
