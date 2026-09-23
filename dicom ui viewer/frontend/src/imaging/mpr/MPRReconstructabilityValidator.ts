/**
 * MPRReconstructabilityValidator
 *
 * Production-grade pre-validation gate for MPR/VR volume construction.
 * Inspired by OHIF's `isDisplaySetReconstructable` engineering pattern.
 *
 * Run BEFORE calling createAndCacheVolume(). If validation FAILs,
 * do NOT attempt volume creation — it will produce corrupted geometry.
 *
 * Engineering rationale:
 *   OHIF uses a strict gate (IOP tolerance 0.01, spacing tolerance 20%)
 *   to reject mixed-orientation series, scouts, and irregular datasets.
 *   MedView PRO now adopts the same discipline.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants (aligned with OHIF source values)
// ─────────────────────────────────────────────────────────────────────────────

/** Per-component IOP tolerance (radians, effectively). OHIF uses 0.01. */
const IOP_TOLERANCE = 0.01;

/** Slice-spacing variance tolerance: a frame may deviate by ±20% of avg spacing. */
const SPACING_TOLERANCE = 0.20;

/** Minimum number of slices required to reconstruct a volume. */
const MIN_SLICE_COUNT = 2;

// ─────────────────────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────────────────────

export type ValidationStatus = 'PASS' | 'WARNING' | 'FAIL';

export interface ValidationDetails {
  sliceCount: number;
  uniqueIOPGroups: number;
  frameOfReferenceUID: string | null;
  averageSpacingMm: number | null;
  maxSpacingDeviationMm: number | null;
  spacingVariancePct: number | null;
  missingIPP: number;
  rows: number | null;
  columns: number | null;
  samplesPerPixel: number | null;
  modality: string | null;
  isScoutSuspected: boolean;
}

export interface ValidationResult {
  status: ValidationStatus;
  reason: string;
  details: ValidationDetails;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Round IOP components to a string key for grouping by orientation. */
function iopGroupKey(iop: number[]): string {
  return iop.map(v => Math.round(v * 1000) / 1000).join(',');
}

/**
 * Returns true if two IOP arrays are within IOP_TOLERANCE for every component.
 * Matches OHIF's `_isSameOrientation()`.
 */
function isSameOrientation(a: number[], b: number[]): boolean {
  if (a.length !== 6 || b.length !== 6) return false;
  for (let i = 0; i < 6; i++) {
    if (Math.abs(a[i] - b[i]) > IOP_TOLERANCE) return false;
  }
  return true;
}

/** 3D Euclidean distance between two IPP points. */
function ippDistance(a: number[], b: number[]): number {
  return Math.sqrt(
    Math.pow(a[0] - b[0], 2) +
    Math.pow(a[1] - b[1], 2) +
    Math.pow(a[2] - b[2], 2)
  );
}

/**
 * Cross product of two 3-component vectors.
 * Used to compute the slice-normal from IOP row×col cosines.
 */
function crossProduct(row: number[], col: number[]): number[] {
  return [
    row[1] * col[2] - row[2] * col[1],
    row[2] * col[0] - row[0] * col[2],
    row[0] * col[1] - row[1] * col[0],
  ];
}

/** Dot product of two 3-component vectors. */
function dotProduct(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Extract a normalized float array from an instance field (handles multiple naming conventions). */
function getIOP(inst: any): number[] {
  let raw = inst.image_orientation || inst.imageOrientationPatient || inst.ImageOrientationPatient;
  if (typeof raw === 'string') raw = raw.split('\\').map(Number);
  if (!Array.isArray(raw) || raw.length !== 6) return [1, 0, 0, 0, 1, 0];
  return raw.map(Number);
}

function getIPP(inst: any): number[] | null {
  let raw = inst.image_position || inst.imagePositionPatient || inst.ImagePositionPatient;
  if (typeof raw === 'string') raw = raw.split('\\').map(Number);
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  return raw.map(Number);
}

function getFrameOfRef(inst: any): string | null {
  return inst.frame_of_reference_uid ||
    inst.frameOfReferenceUID ||
    inst.FrameOfReferenceUID ||
    null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Validator
// ─────────────────────────────────────────────────────────────────────────────

export class MPRReconstructabilityValidator {
  /**
   * Validate a list of DICOM instance metadata objects for MPR/VR reconstructability.
   *
   * @param instances - Array of instance metadata objects from the API
   * @returns ValidationResult with status PASS | WARNING | FAIL and detailed diagnostics
   */
  static validate(instances: any[]): ValidationResult {
    const tag = '[Validation]';

    // ── 0. Minimum slice count ──────────────────────────────────────────────
    if (!instances || instances.length < MIN_SLICE_COUNT) {
      console.warn(`${tag} FAIL — insufficient slices: ${instances?.length ?? 0} < ${MIN_SLICE_COUNT}`);
      return {
        status: 'FAIL',
        reason: `Insufficient slices for volume reconstruction: ${instances?.length ?? 0} instance(s) found, minimum ${MIN_SLICE_COUNT} required.`,
        details: MPRReconstructabilityValidator._emptyDetails(instances?.length ?? 0),
      };
    }

    // ── 1. Collect per-instance metadata ────────────────────────────────────
    const firstInst = instances[0];
    const firstIOP = getIOP(firstInst);
    const firstRows = Number(firstInst.rows || firstInst.Rows || 0);
    const firstCols = Number(firstInst.columns || firstInst.Columns || 0);
    const firstSPP  = Number(firstInst.samples_per_pixel || firstInst.samplesPerPixel || 1);
    const modality  = firstInst.modality || firstInst.Modality || null;

    // ── 2. IOP grouping — detect mixed-orientation / scout series ───────────
    const iopGroupMap: Record<string, number> = {};
    instances.forEach(inst => {
      const key = iopGroupKey(getIOP(inst));
      iopGroupMap[key] = (iopGroupMap[key] || 0) + 1;
    });
    const uniqueIOPGroups = Object.keys(iopGroupMap).length;
    const isScoutSuspected = uniqueIOPGroups > 1;

    if (isScoutSuspected) {
      // Find the largest single-orientation group
      const sortedGroups = Object.entries(iopGroupMap).sort((a, b) => b[1] - a[1]);
      const largestGroupSize = sortedGroups[0][1];
      const groupSummary = sortedGroups.map(([k, n]) => `${n}×[${k}]`).join(', ');

      if (largestGroupSize < MIN_SLICE_COUNT) {
        // Even the largest group is too small — truly unrecoverable FAIL
        console.warn(`${tag} FAIL — mixed orientations, largest group only ${largestGroupSize} slice(s). Groups: ${groupSummary}`);
        return {
          status: 'FAIL',
          reason:
            `This series contains ${uniqueIOPGroups} distinct scan orientations ` +
            `but the largest single-orientation group has only ${largestGroupSize} slice(s), ` +
            `which is insufficient for volume reconstruction.`,
          details: {
            ...MPRReconstructabilityValidator._emptyDetails(instances.length),
            uniqueIOPGroups,
            isScoutSuspected: true,
            modality,
          },
        };
      }

      // Largest group is usable — downgrade to WARNING and allow MPR with fallback grouping
      console.warn(
        `${tag} WARNING — mixed orientations (${uniqueIOPGroups} IOP groups). ` +
        `Largest coherent group: ${largestGroupSize} slices. ` +
        `MPR will use the largest single-orientation group. Groups: ${groupSummary}`
      );
      return {
        status: 'WARNING',
        reason:
          `This series contains ${uniqueIOPGroups} distinct scan orientations ` +
          `(${instances.length} total instances — likely a scout or multi-plane acquisition). ` +
          `MPR/VR will use the largest coherent group: ${largestGroupSize} slices. ` +
          `Anatomy from other orientations will not be included.`,
        details: {
          sliceCount: instances.length,
          uniqueIOPGroups,
          frameOfReferenceUID: null,
          averageSpacingMm: null,
          maxSpacingDeviationMm: null,
          spacingVariancePct: null,
          missingIPP: 0,
          rows: firstRows,
          columns: firstCols,
          samplesPerPixel: firstSPP,
          modality,
          isScoutSuspected: true,
        },
      };
    }

    // ── 3. Per-instance consistency checks ──────────────────────────────────
    let missingIPP = 0;
    const frameOfRefSet = new Set<string>();

    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];

      // IOP consistency
      const iop = getIOP(inst);
      if (!isSameOrientation(iop, firstIOP)) {
        console.warn(`${tag} FAIL — IOP inconsistency at index ${i}`);
        return {
          status: 'FAIL',
          reason: `ImageOrientationPatient inconsistency at instance index ${i}. All slices must share the same orientation for volume reconstruction.`,
          details: MPRReconstructabilityValidator._emptyDetails(instances.length),
        };
      }

      // Dimension consistency
      const rows = Number(inst.rows || inst.Rows || 0);
      const cols = Number(inst.columns || inst.Columns || 0);
      if (firstRows > 0 && rows > 0 && rows !== firstRows) {
        return {
          status: 'FAIL',
          reason: `Row count mismatch: instance ${i} has ${rows} rows, expected ${firstRows}. Volume requires uniform dimensions.`,
          details: MPRReconstructabilityValidator._emptyDetails(instances.length),
        };
      }
      if (firstCols > 0 && cols > 0 && cols !== firstCols) {
        return {
          status: 'FAIL',
          reason: `Column count mismatch: instance ${i} has ${cols} columns, expected ${firstCols}. Volume requires uniform dimensions.`,
          details: MPRReconstructabilityValidator._emptyDetails(instances.length),
        };
      }

      // IPP presence
      const ipp = getIPP(inst);
      if (!ipp) missingIPP++;

      // FrameOfReferenceUID collection
      const forUID = getFrameOfRef(inst);
      if (forUID) frameOfRefSet.add(forUID);
    }

    // ── 4. FrameOfReferenceUID uniformity ───────────────────────────────────
    const frameOfReferenceUID = frameOfRefSet.size > 0 ? [...frameOfRefSet][0] : null;
    if (frameOfRefSet.size > 1) {
      console.warn(`${tag} WARNING — multiple FrameOfReferenceUIDs: ${[...frameOfRefSet].join(', ')}`);
      // WARNING, not FAIL — some real-world series have this (e.g., fused PET-CT)
    }

    // ── 5. Missing IPP check ─────────────────────────────────────────────────
    if (missingIPP === instances.length) {
      return {
        status: 'FAIL',
        reason: 'All instances are missing ImagePositionPatient. Cannot determine spatial ordering or volume geometry.',
        details: {
          ...MPRReconstructabilityValidator._emptyDetails(instances.length),
          missingIPP,
          frameOfReferenceUID,
          modality,
        },
      };
    }

    // ── 6. Slice spacing regularity ──────────────────────────────────────────
    // Use middle instance as reference for normal calculation (OHIF pattern).
    // This prevents a scout image at index 0 from corrupting the normal vector.
    const midIdx = Math.floor(instances.length / 2);
    const refInst = instances[midIdx];
    const refIOP  = getIOP(refInst);

    const rowCos = refIOP.slice(0, 3);
    const colCos = refIOP.slice(3, 6);
    const normal = crossProduct(rowCos, colCos);

    // Project all IPPs onto normal and collect distances
    const instWithIPP = instances.filter(inst => getIPP(inst) !== null);

    let averageSpacingMm: number | null = null;
    let maxSpacingDeviationMm: number | null = null;
    let spacingVariancePct: number | null = null;

    if (instWithIPP.length >= 2) {
      const distances = instWithIPP.map(inst => {
        const ipp = getIPP(inst)!;
        return dotProduct(ipp, normal);
      });
      distances.sort((a, b) => a - b);

      const spacings: number[] = [];
      for (let i = 1; i < distances.length; i++) {
        spacings.push(Math.abs(distances[i] - distances[i - 1]));
      }

      if (spacings.length > 0) {
        const totalSpacing = spacings.reduce((a, b) => a + b, 0);
        averageSpacingMm = totalSpacing / spacings.length;

        const deviations = spacings.map(s => Math.abs(s - averageSpacingMm!));
        maxSpacingDeviationMm = Math.max(...deviations);
        spacingVariancePct = averageSpacingMm > 0
          ? (maxSpacingDeviationMm / averageSpacingMm) * 100
          : 0;

        // Check each gap — gaps more than 20% off from average are irregular
        const TOLERANCE = averageSpacingMm * SPACING_TOLERANCE;
        const irregularGaps = spacings.filter(s => Math.abs(s - averageSpacingMm!) > TOLERANCE);

        if (irregularGaps.length > 0 && averageSpacingMm > 0.001) {
          // Irregular spacing — WARNING or FAIL depending on severity
          if (maxSpacingDeviationMm > averageSpacingMm * 0.5) {
            // >50% deviation = highly irregular (missing slices or wildly inconsistent)
            console.warn(
              `${tag} WARNING — irregular spacing: avg=${averageSpacingMm.toFixed(2)}mm, ` +
              `max deviation=${maxSpacingDeviationMm.toFixed(2)}mm (${spacingVariancePct.toFixed(1)}%). ` +
              `${irregularGaps.length} gap(s) exceed tolerance.`
            );
            return {
              status: 'WARNING',
              reason:
                `Irregular slice spacing detected: average spacing ${averageSpacingMm.toFixed(2)} mm, ` +
                `maximum deviation ${maxSpacingDeviationMm.toFixed(2)} mm ` +
                `(${spacingVariancePct.toFixed(1)}% variance). ` +
                `MPR reconstruction may show gaps or stretched anatomy.`,
              details: {
                sliceCount: instances.length,
                uniqueIOPGroups,
                frameOfReferenceUID,
                averageSpacingMm,
                maxSpacingDeviationMm,
                spacingVariancePct,
                missingIPP,
                rows: firstRows,
                columns: firstCols,
                samplesPerPixel: firstSPP,
                modality,
                isScoutSuspected: false,
              },
            };
          } else {
            // ≤50% but still irregular — log warning, allow reconstruction
            console.warn(
              `${tag} [Geometry] Minor spacing irregularity: ${irregularGaps.length} gap(s) outside 20% tolerance. ` +
              `avg=${averageSpacingMm.toFixed(2)}mm, maxDev=${maxSpacingDeviationMm.toFixed(2)}mm. Proceeding.`
            );
          }
        }
      }
    }

    // ── 7. PixelSpacing validation ───────────────────────────────────────────
    const firstPS = firstInst.pixel_spacing || firstInst.pixelSpacing;
    if (!firstPS || !Array.isArray(firstPS) || firstPS.length < 2) {
      console.warn(`${tag} WARNING — missing PixelSpacing. Anisotropic rendering may be inaccurate.`);
    }

    // ── 8. All checks passed ─────────────────────────────────────────────────
    console.log(
      `[Validation] PASS — ${instances.length} slices, ${uniqueIOPGroups} IOP group, ` +
      `FOR=${frameOfReferenceUID ?? 'unknown'}, ` +
      `spacing=${averageSpacingMm?.toFixed(2) ?? 'n/a'} mm, ` +
      `dims=${firstRows}×${firstCols}, modality=${modality ?? 'unknown'}`
    );

    return {
      status: 'PASS',
      reason: 'Series is reconstructable for MPR/VR.',
      details: {
        sliceCount: instances.length,
        uniqueIOPGroups,
        frameOfReferenceUID,
        averageSpacingMm,
        maxSpacingDeviationMm,
        spacingVariancePct,
        missingIPP,
        rows: firstRows,
        columns: firstCols,
        samplesPerPixel: firstSPP,
        modality,
        isScoutSuspected: false,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private static _emptyDetails(sliceCount: number): ValidationDetails {
    return {
      sliceCount,
      uniqueIOPGroups: 0,
      frameOfReferenceUID: null,
      averageSpacingMm: null,
      maxSpacingDeviationMm: null,
      spacingVariancePct: null,
      missingIPP: 0,
      rows: null,
      columns: null,
      samplesPerPixel: null,
      modality: null,
      isScoutSuspected: false,
    };
  }

  /**
   * Convenience: compute the IPP-derived Z spacing from a sorted list of instances.
   * Uses the middle instance's IOP to define the slice normal.
   * Returns spacing in mm, or null if insufficient data.
   */
  static computeZSpacingMm(instances: any[]): number | null {
    if (instances.length < 2) return null;

    const midIdx = Math.floor(instances.length / 2);
    const refIOP  = getIOP(instances[midIdx]);
    const rowCos  = refIOP.slice(0, 3);
    const colCos  = refIOP.slice(3, 6);
    const normal  = crossProduct(rowCos, colCos);

    const distances = instances
      .map(inst => getIPP(inst))
      .filter((ipp): ipp is number[] => ipp !== null)
      .map(ipp => dotProduct(ipp, normal));

    if (distances.length < 2) return null;
    distances.sort((a, b) => a - b);

    const spacings: number[] = [];
    for (let i = 1; i < distances.length; i++) {
      spacings.push(Math.abs(distances[i] - distances[i - 1]));
    }
    return spacings.reduce((a, b) => a + b, 0) / spacings.length;
  }

  /**
   * Sort instances by their ImagePositionPatient projected onto the slice normal.
   * Uses the MIDDLE instance as the normal reference (OHIF pattern).
   * Ascending order = first slice → last slice.
   */
  static sortByIPP(instances: any[]): any[] {
    if (instances.length <= 1) return instances;

    const midIdx = Math.floor(instances.length / 2);
    const refIOP  = getIOP(instances[midIdx]);
    const rowCos  = refIOP.slice(0, 3);
    const colCos  = refIOP.slice(3, 6);
    const normal  = crossProduct(rowCos, colCos);

    return [...instances].sort((a, b) => {
      const ippA = getIPP(a);
      const ippB = getIPP(b);
      
      // 1. ImagePositionPatient
      if (ippA && ippB) {
        const distA = dotProduct(ippA, normal);
        const distB = dotProduct(ippB, normal);
        // If distances are distinguishable (not virtually the same), sort by distance
        if (Math.abs(distA - distB) > 0.001) {
          return distA - distB;
        }
      }
      
      // 2. InstanceNumber
      const instA = Number(a.instance_number || a.instanceNumber || a.InstanceNumber);
      const instB = Number(b.instance_number || b.instanceNumber || b.InstanceNumber);
      if (!isNaN(instA) && !isNaN(instB) && instA !== instB) {
        return instA - instB;
      }
      
      // 3. SliceLocation
      const locA = Number(a.slice_location || a.sliceLocation || a.SliceLocation);
      const locB = Number(b.slice_location || b.sliceLocation || b.SliceLocation);
      if (!isNaN(locA) && !isNaN(locB) && locA !== locB) {
        return locA - locB;
      }
      
      return 0;
    });
  }

  /**
   * Deduplicate slices to remove temporal phases, retaining only 1 slice per 3D position.
   */
  static filterTemporalPhases(instances: any[]): any[] {
    if (instances.length <= 1) return instances;

    const sorted = MPRReconstructabilityValidator.sortByIPP(instances);
    const midIdx = Math.floor(sorted.length / 2);
    const refIOP  = getIOP(sorted[midIdx]);
    const rowCos  = refIOP.slice(0, 3);
    const colCos  = refIOP.slice(3, 6);
    const normal  = crossProduct(rowCos, colCos);

    const uniqueInstances: any[] = [];
    const seenDistances = new Set<string>();

    for (const inst of sorted) {
      const ipp = getIPP(inst);
      if (!ipp) {
        uniqueInstances.push(inst);
        continue;
      }
      
      const dist = dotProduct(ipp, normal);
      const distKey = dist.toFixed(2); // Group slices within ~0.01mm

      if (!seenDistances.has(distKey)) {
        seenDistances.add(distKey);
        uniqueInstances.push(inst);
      }
    }

    return uniqueInstances;
  }

  /**
   * Filters a list of instances to keep only the largest single-orientation coherent group.
   * Isolates the true 3D volume stack and removes orthogonal scout/localizer slices.
   */
  static filterCoherentOrientationGroup(instances: any[]): any[] {
    if (!instances || instances.length <= 1) return instances;

    const iopGroupMap = new Map<string, any[]>();
    instances.forEach(inst => {
      const key = iopGroupKey(getIOP(inst));
      if (!iopGroupMap.has(key)) {
        iopGroupMap.set(key, []);
      }
      iopGroupMap.get(key)!.push(inst);
    });

    if (iopGroupMap.size <= 1) return instances;

    // Sort groups descending by slice count
    const sortedGroups = [...iopGroupMap.values()].sort((a, b) => b.length - a.length);
    return sortedGroups[0];
  }
}
