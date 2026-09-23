/**
 * Window / level handling.
 *
 * Windowing is a DISPLAY transform only. Nothing in this module writes to the
 * volume; presets set window centre and width on a viewport's display
 * properties and nowhere else, so the stored DICOM values stay intact and
 * quantitative readout remains valid.
 */

import type { IntensityUnits } from '../volume/modality';

export interface WindowLevel {
  /** Window centre — displayed as "W". For CT this is in Hounsfield units. */
  readonly center: number;
  /** Window width — displayed as "WW". */
  readonly width: number;
}

export interface WindowPreset extends WindowLevel {
  readonly id: string;
  readonly label: string;
  /** Keyboard shortcut digit, matching workstation convention. */
  readonly shortcut?: string;
}

/** CT presets, in Hounsfield units. Applied only when the volume genuinely carries HU values. */
export const CT_PRESETS: readonly WindowPreset[] = [
  { id: 'soft', label: 'Soft Tissue', center: 40, width: 400, shortcut: '1' },
  { id: 'lung', label: 'Lung', center: -600, width: 1500, shortcut: '2' },
  { id: 'bone', label: 'Bone', center: 300, width: 1500, shortcut: '3' },
  { id: 'brain', label: 'Brain', center: 40, width: 80, shortcut: '4' },
  { id: 'liver', label: 'Liver', center: 60, width: 160, shortcut: '5' },
  { id: 'mediastinum', label: 'Mediastinum', center: 50, width: 350, shortcut: '6' },
  { id: 'angio', label: 'CTA', center: 200, width: 700, shortcut: '7' },
];

/**
 * MRI has no standard absolute intensity scale, so there are no fixed presets.
 * A window is derived from the actual data instead.
 */
export function defaultWindowForModality(
  modality: string,
  units: IntensityUnits,
  statistics?: { min: number; max: number; p1?: number; p99?: number },
): WindowLevel {
  const m = (modality ?? '').toUpperCase();

  if (m === 'CT' && units === 'HU') {
    const soft = CT_PRESETS[0];
    return { center: soft.center, width: soft.width };
  }

  if (statistics) {
    // Robust percentile window keeps outliers (metal, noise spikes, the air
    // background) from flattening the displayed contrast.
    const lo = statistics.p1 ?? statistics.min;
    const hi = statistics.p99 ?? statistics.max;
    const width = Math.max(hi - lo, 1);
    return { center: lo + width / 2, width };
  }

  return { center: 128, width: 256 };
}

/**
 * Interactive window/level drag.
 * Horizontal drag changes width, vertical drag changes centre — the
 * convention used across clinical workstations.
 */
export function applyWindowLevelDelta(
  current: WindowLevel,
  deltaX: number,
  deltaY: number,
  sensitivity = 1,
): WindowLevel {
  const width = Math.max(1, current.width + deltaX * sensitivity);
  const center = current.center + deltaY * sensitivity;
  return { center, width };
}

/** Window centre/width -> VOI LUT range used by the renderer. */
export function toVoiRange(wl: WindowLevel): { lower: number; upper: number } {
  return {
    lower: wl.center - wl.width / 2,
    upper: wl.center + wl.width / 2,
  };
}

export function fromVoiRange(range: { lower: number; upper: number }): WindowLevel {
  return {
    width: range.upper - range.lower,
    center: (range.upper + range.lower) / 2,
  };
}

/** Clinical notation for the overlay, e.g. "W 40  WW 400". */
export function formatWindowLevel(wl: WindowLevel, units: IntensityUnits): string {
  const suffix = units === 'HU' ? '' : '';
  return `W ${Math.round(wl.center)}${suffix}  WW ${Math.round(wl.width)}${suffix}`;
}

export function presetsForModality(
  modality: string,
  units: IntensityUnits,
): readonly WindowPreset[] {
  return (modality ?? '').toUpperCase() === 'CT' && units === 'HU'
    ? CT_PRESETS
    : [];
}
