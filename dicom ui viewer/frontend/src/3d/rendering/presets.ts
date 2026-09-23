/**
 * Transfer-function preset engine (§8).
 *
 * IMPORTANT: none of the HU values below are clinically validated thresholds. They are
 * starting points for interactive adjustment, and `adaptPresetToVolume` shifts them to
 * suit the actual HU distribution of the loaded dataset before first render.
 */
import type { TransferFunction, OpacityPoint, ColorPoint } from './transferFunction';
import { cloneTransferFunction, normalizeTransferFunction } from './transferFunction';
import type { VolumeStatistics } from '@3d/volume/types';

const rgb = (r: number, g: number, b: number): [number, number, number] => [r / 255, g / 255, b / 255];

function tf(
  id: string, name: string, description: string,
  opacity: OpacityPoint[], color: ColorPoint[],
  overrides: Partial<TransferFunction> = {},
): TransferFunction {
  return normalizeTransferFunction({
    id, name, description, opacity, color,
    gradientOpacity: { enabled: true, min: 0, max: 90, minOpacity: 0, maxOpacity: 1 },
    shading: { enabled: true, ambient: 0.22, diffuse: 0.78, specular: 0.32, specularPower: 16 },
    interpolation: 'linear',
    blendMode: 'composite',
    scalarOpacityUnitDistance: 1.5,
    interpolationType: 'linear',
    builtIn: true,
    ...overrides,
  });
}

/* --------------------------------------------------------------- built-ins */

export const PRESET_BONE = tf(
  'bone', 'Bone',
  'Dense structures only, with surface-emphasising gradient opacity. The default for a bone-reconstruction CT.',
  [
    { hu: -1024, opacity: 0 },
    { hu: 120, opacity: 0 },
    { hu: 220, opacity: 0.12 },
    { hu: 380, opacity: 0.72 },
    { hu: 700, opacity: 0.92 },
    { hu: 1600, opacity: 1.0 },
    { hu: 3071, opacity: 1.0 },
  ],
  [
    { hu: 120, color: rgb(120, 80, 62) },
    { hu: 240, color: rgb(188, 148, 112) },
    { hu: 420, color: rgb(226, 204, 172) },
    { hu: 800, color: rgb(244, 236, 216) },
    { hu: 1600, color: rgb(255, 252, 245) },
    { hu: 3071, color: rgb(255, 255, 255) },
  ],
  { gradientOpacity: { enabled: true, min: 4, max: 110, minOpacity: 0, maxOpacity: 1 },
    shading: { enabled: true, ambient: 0.20, diffuse: 0.80, specular: 0.38, specularPower: 18 },
    scalarOpacityUnitDistance: 1.2 },
);

export const PRESET_BONE_DETAILED = tf(
  'bone-detailed', 'Bone Detailed',
  'Lower entry threshold and a harder gradient response, for trabecular detail and thin cortical shells.',
  [
    { hu: -1024, opacity: 0 },
    { hu: 90, opacity: 0 },
    { hu: 160, opacity: 0.10 },
    { hu: 300, opacity: 0.55 },
    { hu: 520, opacity: 0.88 },
    { hu: 1200, opacity: 1.0 },
    { hu: 3071, opacity: 1.0 },
  ],
  [
    { hu: 90, color: rgb(110, 74, 58) },
    { hu: 200, color: rgb(196, 158, 118) },
    { hu: 400, color: rgb(232, 212, 182) },
    { hu: 900, color: rgb(250, 244, 228) },
    { hu: 3071, color: rgb(255, 255, 255) },
  ],
  { gradientOpacity: { enabled: true, min: 2, max: 70, minOpacity: 0, maxOpacity: 1 },
    shading: { enabled: true, ambient: 0.16, diffuse: 0.84, specular: 0.45, specularPower: 24 },
    scalarOpacityUnitDistance: 0.9 },
);

export const PRESET_HIGH_CONTRAST_BONE = tf(
  'bone-high-contrast', 'High-Contrast Bone',
  'Near-binary opacity step at the bone threshold, giving a crisp surface-like appearance while remaining volume rendering.',
  [
    { hu: -1024, opacity: 0 },
    { hu: 250, opacity: 0 },
    { hu: 300, opacity: 0.95 },
    { hu: 3071, opacity: 1.0 },
  ],
  [
    { hu: 250, color: rgb(214, 196, 168) },
    { hu: 600, color: rgb(244, 238, 224) },
    { hu: 3071, color: rgb(255, 255, 255) },
  ],
  { gradientOpacity: { enabled: true, min: 6, max: 140, minOpacity: 0, maxOpacity: 1 },
    shading: { enabled: true, ambient: 0.18, diffuse: 0.82, specular: 0.5, specularPower: 30 },
    scalarOpacityUnitDistance: 0.8 },
);

export const PRESET_BONE_SOFT = tf(
  'bone-soft-tissue', 'Bone + Soft Tissue',
  'Translucent soft tissue over opaque bone, so surface anatomy and skeleton are visible together.',
  [
    { hu: -1024, opacity: 0 },
    { hu: -200, opacity: 0 },
    { hu: -80, opacity: 0.02 },
    { hu: 40, opacity: 0.06 },
    { hu: 150, opacity: 0.10 },
    { hu: 300, opacity: 0.55 },
    { hu: 700, opacity: 0.92 },
    { hu: 3071, opacity: 1.0 },
  ],
  [
    { hu: -200, color: rgb(70, 40, 34) },
    { hu: -60, color: rgb(160, 96, 80) },
    { hu: 40, color: rgb(196, 128, 108) },
    { hu: 160, color: rgb(214, 172, 134) },
    { hu: 400, color: rgb(232, 214, 184) },
    { hu: 1000, color: rgb(250, 246, 234) },
    { hu: 3071, color: rgb(255, 255, 255) },
  ],
  { gradientOpacity: { enabled: true, min: 3, max: 95, minOpacity: 0, maxOpacity: 1 },
    scalarOpacityUnitDistance: 2.0 },
);

export const PRESET_SOFT_TISSUE = tf(
  'soft-tissue', 'Soft Tissue',
  'Muscle, organ and fat range with a neutral tissue palette; dense structures fade out so they do not dominate.',
  [
    { hu: -1024, opacity: 0 },
    { hu: -160, opacity: 0 },
    { hu: -60, opacity: 0.08 },
    { hu: 20, opacity: 0.30 },
    { hu: 90, opacity: 0.50 },
    { hu: 200, opacity: 0.32 },
    { hu: 500, opacity: 0.12 },
    { hu: 3071, opacity: 0.08 },
  ],
  [
    { hu: -160, color: rgb(80, 52, 42) },
    { hu: -60, color: rgb(170, 118, 96) },
    { hu: 10, color: rgb(206, 150, 126) },
    { hu: 70, color: rgb(220, 176, 150) },
    { hu: 200, color: rgb(228, 206, 182) },
    { hu: 3071, color: rgb(240, 236, 228) },
  ],
  { gradientOpacity: { enabled: true, min: 1, max: 45, minOpacity: 0.05, maxOpacity: 1 },
    shading: { enabled: true, ambient: 0.28, diffuse: 0.74, specular: 0.18, specularPower: 10 },
    scalarOpacityUnitDistance: 3.5 },
);

export const PRESET_SKIN = tf(
  'skin', 'Skin',
  'Air/skin interface only: a semi-transparent external surface, useful for orientation and surface anatomy.',
  [
    { hu: -1024, opacity: 0 },
    { hu: -420, opacity: 0 },
    { hu: -300, opacity: 0.25 },
    { hu: -120, opacity: 0.42 },
    { hu: 60, opacity: 0.20 },
    { hu: 400, opacity: 0.06 },
    { hu: 3071, opacity: 0.05 },
  ],
  [
    { hu: -420, color: rgb(150, 106, 88) },
    { hu: -200, color: rgb(214, 162, 134) },
    { hu: -40, color: rgb(230, 190, 166) },
    { hu: 300, color: rgb(236, 220, 202) },
    { hu: 3071, color: rgb(248, 244, 238) },
  ],
  { gradientOpacity: { enabled: true, min: 8, max: 60, minOpacity: 0, maxOpacity: 1 },
    shading: { enabled: true, ambient: 0.3, diffuse: 0.7, specular: 0.14, specularPower: 8 },
    scalarOpacityUnitDistance: 4.0 },
);

export const PRESET_MUSCLE = tf(
  'muscle', 'Muscle',
  'Narrow window around the muscle attenuation range; fat and bone are suppressed.',
  [
    { hu: -1024, opacity: 0 },
    { hu: 10, opacity: 0 },
    { hu: 35, opacity: 0.35 },
    { hu: 70, opacity: 0.55 },
    { hu: 110, opacity: 0.30 },
    { hu: 180, opacity: 0.04 },
    { hu: 3071, opacity: 0.02 },
  ],
  [
    { hu: 10, color: rgb(120, 40, 40) },
    { hu: 50, color: rgb(186, 72, 64) },
    { hu: 100, color: rgb(214, 118, 100) },
    { hu: 3071, color: rgb(232, 200, 186) },
  ],
  { gradientOpacity: { enabled: true, min: 1, max: 40, minOpacity: 0.1, maxOpacity: 1 },
    scalarOpacityUnitDistance: 3.0 },
);

export const PRESET_VASCULAR = tf(
  'vascular-cta', 'Vascular / CTA',
  'Iodine-contrast attenuation range in a warm vessel palette, with surrounding tissue nearly transparent. ' +
  'This highlights an attenuation range — it does not identify vessels; use segmentation for that.',
  [
    { hu: -1024, opacity: 0 },
    { hu: 120, opacity: 0 },
    { hu: 170, opacity: 0.18 },
    { hu: 260, opacity: 0.62 },
    { hu: 420, opacity: 0.88 },
    { hu: 800, opacity: 0.55 },
    { hu: 1400, opacity: 0.30 },
    { hu: 3071, opacity: 0.25 },
  ],
  [
    { hu: 120, color: rgb(110, 12, 12) },
    { hu: 200, color: rgb(198, 42, 30) },
    { hu: 300, color: rgb(238, 106, 40) },
    { hu: 460, color: rgb(252, 186, 80) },
    { hu: 900, color: rgb(250, 232, 196) },
    { hu: 3071, color: rgb(242, 240, 236) },
  ],
  { gradientOpacity: { enabled: true, min: 3, max: 80, minOpacity: 0, maxOpacity: 1 },
    shading: { enabled: true, ambient: 0.24, diffuse: 0.80, specular: 0.30, specularPower: 14 },
    scalarOpacityUnitDistance: 1.4 },
);

export const PRESET_LUNG = tf(
  'lung', 'Lung',
  'Low-attenuation parenchyma and airways; dense structures are suppressed.',
  [
    { hu: -1024, opacity: 0 },
    { hu: -950, opacity: 0.04 },
    { hu: -800, opacity: 0.18 },
    { hu: -600, opacity: 0.28 },
    { hu: -400, opacity: 0.10 },
    { hu: -100, opacity: 0.02 },
    { hu: 3071, opacity: 0.0 },
  ],
  [
    { hu: -1000, color: rgb(30, 40, 60) },
    { hu: -820, color: rgb(90, 130, 170) },
    { hu: -600, color: rgb(170, 200, 220) },
    { hu: -300, color: rgb(226, 214, 200) },
    { hu: 3071, color: rgb(240, 236, 232) },
  ],
  { gradientOpacity: { enabled: true, min: 1, max: 50, minOpacity: 0.2, maxOpacity: 1 },
    shading: { enabled: true, ambient: 0.35, diffuse: 0.65, specular: 0.1, specularPower: 6 },
    scalarOpacityUnitDistance: 6.0 },
);

export const PRESET_MIP = tf(
  'mip', 'Maximum Intensity Projection',
  'Projection mode, not a volume rendering: displays the brightest sample along each ray. Useful for dense structures and contrast.',
  [
    { hu: -1024, opacity: 0 },
    { hu: 100, opacity: 0 },
    { hu: 1200, opacity: 1 },
    { hu: 3071, opacity: 1 },
  ],
  [
    { hu: 100, color: rgb(0, 0, 0) },
    { hu: 3071, color: rgb(255, 255, 255) },
  ],
  { blendMode: 'mip',
    gradientOpacity: { enabled: false, min: 0, max: 1, minOpacity: 1, maxOpacity: 1 },
    shading: { enabled: false, ambient: 1, diffuse: 0, specular: 0, specularPower: 1 } },
);

export const BUILT_IN_PRESETS: readonly TransferFunction[] = [
  PRESET_BONE, PRESET_BONE_DETAILED, PRESET_BONE_SOFT, PRESET_SOFT_TISSUE,
  PRESET_SKIN, PRESET_MUSCLE, PRESET_VASCULAR, PRESET_HIGH_CONTRAST_BONE,
  PRESET_LUNG, PRESET_MIP,
];

export function emptyCustomPreset(base: TransferFunction): TransferFunction {
  return cloneTransferFunction(base, {
    id: `custom-${Date.now().toString(36)}`, name: 'Custom', builtIn: false, description: `Derived from "${base.name}".`,
  });
}

/* --------------------------------------------------------------- adaptation */

export interface AdaptationReport {
  readonly shiftHU: number;
  readonly widthScale: number;
  readonly rationale: string;
}

/**
 * Shift a preset so its "material entry" point sits where this dataset's dense tail
 * actually begins. Prevents a preset tuned on one scanner/kernel from rendering an
 * empty viewport on another (§32: never show an empty black viewport).
 */
export function adaptPresetToVolume(
  preset: TransferFunction, stats: VolumeStatistics,
): { tf: TransferFunction; report: AdaptationReport } {
  const denseFamily = ['bone', 'bone-detailed', 'bone-high-contrast', 'bone-soft-tissue', 'vascular-cta'];
  if (!denseFamily.includes(preset.id)) {
    return { tf: preset, report: { shiftHU: 0, widthScale: 1, rationale: 'Preset is not density-anchored; used unchanged.' } };
  }

  // Reference anchor: where the preset first reaches 10 % opacity.
  const anchor = firstOpacityCrossing(preset, 0.10);
  if (anchor === null) {
    return { tf: preset, report: { shiftHU: 0, widthScale: 1, rationale: 'Preset has no 10 % opacity crossing; used unchanged.' } };
  }

  // Dataset anchor: the 99.5th percentile marks where the dense tail lives.
  const p995 = percentile(stats, 99.5);
  const target = preset.id === 'vascular-cta' ? Math.min(anchor, Math.max(140, p995 * 0.35)) : Math.min(anchor, Math.max(120, p995 * 0.30));
  let shift = target - anchor;

  // Only shift when the mismatch is material; small shifts add noise, not value.
  if (Math.abs(shift) < 25) shift = 0;
  // Never shift a bone preset below soft-tissue noise.
  if (anchor + shift < 100) shift = 100 - anchor;

  const adapted = shift === 0 ? preset : {
    ...preset,
    id: preset.id,
    opacity: preset.opacity.map((p) => ({ ...p, hu: p.hu <= -1000 ? p.hu : p.hu + shift })),
    color: preset.color.map((p) => ({ ...p, hu: p.hu + shift })),
  };

  return {
    tf: normalizeTransferFunction(adapted),
    report: {
      shiftHU: shift, widthScale: 1,
      rationale: shift === 0
        ? `Preset entry (${Math.round(anchor)} HU) already matches this dataset (99.5th percentile ${Math.round(p995)} HU).`
        : `Preset entry shifted by ${shift > 0 ? '+' : ''}${Math.round(shift)} HU so it sits at ${Math.round(anchor + shift)} HU, ` +
          `matching this dataset's dense tail (99.5th percentile ${Math.round(p995)} HU).`,
    },
  };
}

function firstOpacityCrossing(tf: TransferFunction, level: number): number | null {
  for (let i = 1; i < tf.opacity.length; i++) {
    const a = tf.opacity[i - 1], b = tf.opacity[i];
    if (a.opacity < level && b.opacity >= level) {
      const t = (level - a.opacity) / (b.opacity - a.opacity);
      return a.hu + (b.hu - a.hu) * t;
    }
  }
  return null;
}

function percentile(stats: VolumeStatistics, p: number): number {
  const { counts, min, binWidth, total } = stats.histogram;
  const target = (p / 100) * total;
  let acc = 0;
  for (let i = 0; i < counts.length; i++) {
    acc += counts[i];
    if (acc >= target) return min + i * binWidth;
  }
  return stats.max;
}

/**
 * Choose the opening preset for a freshly loaded dataset (§32). Uses the dataset's own
 * distribution rather than assuming a body part.
 */
export function chooseInitialPreset(
  stats: VolumeStatistics, contrastLikely: boolean,
): { preset: TransferFunction; reason: string } {
  const p995 = percentile(stats, 99.5);
  if (stats.airFraction > 0.25 && p995 < 400) {
    return { preset: PRESET_LUNG, reason: `${(stats.airFraction * 100).toFixed(0)} % of voxels are below −500 HU and the dense tail is weak; opened with the Lung preset.` };
  }
  if (contrastLikely) {
    return { preset: PRESET_VASCULAR, reason: 'The series is flagged as contrast-enhanced; opened with the Vascular / CTA preset.' };
  }
  if (p995 >= 300) {
    return { preset: PRESET_BONE, reason: `The 99.5th percentile is ${Math.round(p995)} HU, so dense bone is present; opened with the Bone preset.` };
  }
  return { preset: PRESET_SOFT_TISSUE, reason: `The 99.5th percentile is only ${Math.round(p995)} HU, so no strong dense tail exists; opened with the Soft Tissue preset.` };
}

/* --------------------------------------------------- import / export (§8) */

export interface PresetFile {
  readonly schema: 'medview.transferfunction';
  readonly version: number;
  readonly presets: readonly TransferFunction[];
}

export function exportPresets(presets: readonly TransferFunction[]): string {
  const file: PresetFile = { schema: 'medview.transferfunction', version: 1, presets };
  return JSON.stringify(file, null, 2);
}

export function importPresets(json: string): TransferFunction[] {
  const parsed = JSON.parse(json) as PresetFile;
  if (parsed?.schema !== 'medview.transferfunction') {
    throw new Error('This file is not a MedView transfer-function preset file.');
  }
  if (parsed.version > 1) {
    throw new Error(`This preset file was written by a newer version (v${parsed.version}) and cannot be read.`);
  }
  return parsed.presets.map((p) => normalizeTransferFunction({ ...p, builtIn: false }));
}
