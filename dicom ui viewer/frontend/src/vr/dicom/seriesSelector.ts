/**
 * Grouping and volumetric-series selection (§3 STEP 4).
 *
 * Selection is deterministic and fully explained: every series carries the reasons
 * behind its score so the user can see why a candidate was chosen or rejected.
 */
import { CT_SOP_CLASSES, NON_IMAGE_SOP_CLASSES, SECONDARY_CAPTURE_SOP_CLASSES } from './dictionary';
import { transferSyntax } from './transferSyntax';
import { analyzeGeometry } from './geometry';
import type { DicomInstanceMeta, SeriesSummary, StudySummary, SeriesRole } from './types';

export interface SelectionOptions {
  /** Minimum number of frames before a series is considered volumetric. */
  minSlices?: number;
  /** Restrict the candidate pool to one modality. */
  modality?: string;
}

const DEFAULT_MIN_SLICES = 16;

const LOCALIZER_HINTS = ['localizer', 'scout', 'topogram', 'surview', 'pilot'];
const NON_VOLUME_DESCRIPTION_HINTS = ['dose report', 'dose_report', 'exam summary', 'summary', 'screen save', 'screensave', 'patient protocol', 'key images'];

function looksLikeLocalizer(m: DicomInstanceMeta): boolean {
  const type = m.imageType.map((s) => s.toUpperCase());
  if (type.includes('LOCALIZER') || type.includes('SCOUT') || type.includes('TOPOGRAM')) return true;
  const d = (m.seriesDescription ?? '').toLowerCase();
  return LOCALIZER_HINTS.some((h) => d.includes(h));
}

function looksLikeReport(m: DicomInstanceMeta): boolean {
  const d = (m.seriesDescription ?? '').toLowerCase();
  return NON_VOLUME_DESCRIPTION_HINTS.some((h) => d.includes(h));
}

export function classifySeries(instances: readonly DicomInstanceMeta[], minSlices: number): SeriesRole {
  const first = instances[0];
  if (NON_IMAGE_SOP_CLASSES.has(first.sopClassUID)) return 'non-image';
  if (!instances.some((m) => m.hasPixelData)) return 'non-image';
  if (SECONDARY_CAPTURE_SOP_CLASSES.has(first.sopClassUID)) return 'secondary';
  if (looksLikeLocalizer(first)) return 'localizer';
  if (looksLikeReport(first)) return 'secondary';
  if (!transferSyntax(first.transferSyntaxUID) || transferSyntax(first.transferSyntaxUID).codec === 'unsupported') return 'unsupported';

  const frameCount = instances.reduce((a, m) => a + Math.max(1, m.numberOfFrames), 0);
  if (frameCount < minSlices) return 'single-image';
  if (!first.imageOrientationPatient || !first.imagePositionPatient) return 'derived';

  const type = first.imageType.map((s) => s.toUpperCase());
  const isDerivedOnly = type[0] === 'DERIVED' && !type.includes('PRIMARY');
  return isDerivedOnly ? 'derived' : 'volumetric';
}

/** 0..1 suitability score for CT 3D volume rendering, with the reasons behind it. */
export function scoreSeries(
  instances: readonly DicomInstanceMeta[], role: SeriesRole,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const first = instances[0];
  if (role !== 'volumetric') {
    reasons.push(`classified as "${role}" — not a volume candidate`);
    return { score: 0, reasons };
  }

  let score = 0;

  if (first.modality === 'CT') { score += 0.30; reasons.push('CT modality (+0.30)'); }
  else { reasons.push(`modality ${first.modality || 'unknown'} — this engine targets CT (+0.00)`); }

  if (CT_SOP_CLASSES.has(first.sopClassUID)) { score += 0.05; reasons.push('CT Image Storage SOP class (+0.05)'); }

  const type = first.imageType.map((s) => s.toUpperCase());
  if (type.includes('ORIGINAL') && type.includes('PRIMARY')) { score += 0.10; reasons.push('ORIGINAL\\PRIMARY image type (+0.10)'); }
  if (type.includes('AXIAL')) { score += 0.03; reasons.push('AXIAL image type (+0.03)'); }

  const geom = analyzeGeometry(instances);
  if (geom.geometry) {
    score += 0.15; reasons.push('constructible rectilinear geometry (+0.15)');
    if (geom.stats.spacingRelativeDeviation <= 0.01) { score += 0.10; reasons.push('uniform slice spacing (+0.10)'); }
    else { reasons.push(`slice spacing varies by ${(geom.stats.spacingRelativeDeviation * 100).toFixed(1)} % (+0.00)`); }
    if (geom.stats.stackShearDeg <= 0.1) { score += 0.05; reasons.push('no gantry tilt (+0.05)'); }
  } else {
    reasons.push('geometry could not be constructed (+0.00)');
  }

  const frameCount = instances.reduce((a, m) => a + Math.max(1, m.numberOfFrames), 0);
  const sliceScore = Math.min(1, Math.log10(Math.max(1, frameCount)) / Math.log10(600));
  score += 0.15 * sliceScore;
  reasons.push(`${frameCount} frames (+${(0.15 * sliceScore).toFixed(3)})`);

  const spacing = geom.stats.spacingMedian;
  if (Number.isFinite(spacing) && spacing > 0) {
    // Thin slices give better 3D detail; 0.5 mm scores full marks, 5 mm scores none.
    const thin = Math.max(0, Math.min(1, (5 - spacing) / 4.5));
    score += 0.07 * thin;
    reasons.push(`${spacing.toFixed(2)} mm slice spacing (+${(0.07 * thin).toFixed(3)})`);
  }

  if (first.rows >= 512 && first.columns >= 512) { score += 0.05; reasons.push(`${first.columns}×${first.rows} matrix (+0.05)`); }

  if (first.lossyImageCompression === '01') { score -= 0.05; reasons.push('lossy compression declared (−0.05)'); }

  return { score: Math.max(0, Math.min(1, score)), reasons };
}

export function groupIntoStudies(
  instances: readonly DicomInstanceMeta[], opts: SelectionOptions = {},
): StudySummary[] {
  const minSlices = opts.minSlices ?? DEFAULT_MIN_SLICES;
  const bySeries = new Map<string, DicomInstanceMeta[]>();
  for (const m of instances) {
    if (opts.modality && m.modality !== opts.modality) continue;
    // FrameOfReferenceUID participates in the key so that a re-used SeriesInstanceUID
    // across frames of reference cannot silently merge into one volume.
    const key = `${m.studyInstanceUID}|${m.seriesInstanceUID}|${m.frameOfReferenceUID ?? ''}`;
    const list = bySeries.get(key);
    if (list) list.push(m); else bySeries.set(key, [m]);
  }

  const summaries: SeriesSummary[] = [];
  for (const list of bySeries.values()) {
    list.sort((a, b) => (a.instanceNumber ?? 0) - (b.instanceNumber ?? 0));
    const first = list[0];
    const role = classifySeries(list, minSlices);
    const { score, reasons } = scoreSeries(list, role);
    const ts = transferSyntax(first.transferSyntaxUID);
    summaries.push({
      seriesInstanceUID: first.seriesInstanceUID,
      studyInstanceUID: first.studyInstanceUID,
      frameOfReferenceUID: first.frameOfReferenceUID,
      modality: first.modality,
      seriesNumber: first.seriesNumber,
      seriesDescription: first.seriesDescription,
      imageType: first.imageType,
      instanceCount: list.length,
      frameCount: list.reduce((a, m) => a + Math.max(1, m.numberOfFrames), 0),
      rows: first.rows, columns: first.columns,
      pixelSpacing: first.pixelSpacing,
      sliceThickness: first.sliceThickness,
      spacingBetweenSlices: first.spacingBetweenSlices,
      imageOrientationPatient: first.imageOrientationPatient,
      patientPosition: first.patientPosition,
      transferSyntaxUID: ts.uid, transferSyntaxName: ts.name,
      convolutionKernel: first.convolutionKernel,
      manufacturer: first.manufacturer,
      manufacturerModelName: first.manufacturerModelName,
      contrastBolusAgent: first.contrastBolusAgent,
      role, volumeScore: score, scoreReasons: reasons,
      instances: list,
    });
  }

  const byStudy = new Map<string, SeriesSummary[]>();
  for (const s of summaries) {
    const list = byStudy.get(s.studyInstanceUID);
    if (list) list.push(s); else byStudy.set(s.studyInstanceUID, [s]);
  }

  return [...byStudy.entries()].map(([uid, series]) => {
    series.sort((a, b) => b.volumeScore - a.volumeScore || (a.seriesNumber ?? 0) - (b.seriesNumber ?? 0));
    const anyInstance = series[0].instances[0];
    return {
      studyInstanceUID: uid,
      studyDescription: anyInstance.studyDescription,
      studyDate: anyInstance.studyDate,
      series,
    };
  });
}

/** Best volumetric CT candidate across all studies, or null when none qualifies. */
export function selectVolumeSeries(studies: readonly StudySummary[]): SeriesSummary | null {
  const candidates = studies.flatMap((s) => s.series).filter((s) => s.role === 'volumetric' && s.volumeScore > 0);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.volumeScore - a.volumeScore || b.frameCount - a.frameCount);
  return candidates[0];
}

/** Heuristic only — never a diagnostic statement (§10). */
export function contrastLikelihood(series: SeriesSummary): { likely: boolean; reason: string } {
  if (series.contrastBolusAgent && series.contrastBolusAgent.trim().length > 0) {
    return { likely: true, reason: `Contrast/Bolus Agent (0018,0010) = "${series.contrastBolusAgent}"` };
  }
  const d = (series.seriesDescription ?? '').toLowerCase();
  for (const hint of ['cta', 'angio', 'contrast', 'c+', 'post contrast', 'arterial', 'venous']) {
    if (d.includes(hint)) return { likely: true, reason: `series description contains "${hint}"` };
  }
  return { likely: false, reason: 'no Contrast/Bolus Agent tag and no contrast hint in the series description' };
}
