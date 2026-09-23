/**
 * Modality-specific intensity handling.
 *
 * CT stored pixel values are converted to modality units (Hounsfield) with
 * Rescale Slope / Intercept. MRI stored values are arbitrary and must NOT be
 * pushed through HU logic; only a slope/intercept explicitly present in the
 * dataset is honoured, and the result is labelled as arbitrary units.
 *
 * The source pixel data is never modified in place. Conversion always produces
 * a separate buffer, so the original DICOM values remain available for export,
 * re-windowing and quantitative readout.
 */

export type IntensityUnits = 'HU' | 'arbitrary' | 'suv' | 'unknown';

export interface RescaleParameters {
  readonly slope: number;
  readonly intercept: number;
  readonly units: IntensityUnits;
  /** True when slope/intercept came from the dataset rather than a default. */
  readonly fromDataset: boolean;
}

export function resolveRescale(
  modality: string,
  slope?: number,
  intercept?: number,
): RescaleParameters {
  const m = (modality ?? '').toUpperCase();
  const hasSlope = Number.isFinite(slope) && slope !== 0;
  const hasIntercept = Number.isFinite(intercept);

  if (m === 'CT') {
    // A conformant CT image always carries (0028,1052)/(0028,1053). If it does
    // not, identity is used and the caller is told the values are not HU.
    if (hasSlope || hasIntercept) {
      return {
        slope: hasSlope ? (slope as number) : 1,
        intercept: hasIntercept ? (intercept as number) : 0,
        units: 'HU',
        fromDataset: true,
      };
    }
    return { slope: 1, intercept: 0, units: 'unknown', fromDataset: false };
  }

  // MR / other: never synthesise a CT-style transform.
  if (hasSlope || hasIntercept) {
    return {
      slope: hasSlope ? (slope as number) : 1,
      intercept: hasIntercept ? (intercept as number) : 0,
      units: 'arbitrary',
      fromDataset: true,
    };
  }
  return { slope: 1, intercept: 0, units: 'arbitrary', fromDataset: false };
}

/** stored value -> modality value. */
export function applyRescale(stored: number, r: RescaleParameters): number {
  return stored * r.slope + r.intercept;
}

/** modality value -> stored value (for quantitative readout round-trips). */
export function removeRescale(modalityValue: number, r: RescaleParameters): number {
  return (modalityValue - r.intercept) / r.slope;
}

export function unitsLabel(units: IntensityUnits): string {
  switch (units) {
    case 'HU':
      return 'HU';
    case 'suv':
      return 'SUV';
    case 'arbitrary':
      return 'a.u.';
    default:
      return '';
  }
}
