import type { StudySummary, SeriesSummary } from './types';
import type { GeometryAnalysis } from './geometry';
import type { DiagnosticIssue } from '@/core/errors';
import type { VolumeStatistics } from '@/volume/types';
import { orientationCode, anatomicalLabel } from './geometry';
import { transferSyntax } from './transferSyntax';

/** The dataset diagnostics report required by §3 / §35. */
export interface DatasetDiagnostics {
  readonly filesFound: number;
  readonly filesAfterArchiveExpansion: number;
  readonly validDicomFiles: number;
  readonly rejectedFiles: ReadonlyArray<{ path: string; reason: string }>;
  readonly studyCount: number;
  readonly seriesCount: number;
  readonly studies: readonly StudySummary[];
  readonly selectedSeriesUID: string | null;
  readonly selectionReason: string;
  readonly issues: readonly DiagnosticIssue[];
  readonly timings: Readonly<Record<string, number>>;
}

export interface SeriesReport {
  readonly studyInstanceUID: string;
  readonly seriesInstanceUID: string;
  readonly frameOfReferenceUID: string;
  readonly modality: string;
  readonly seriesDescription: string;
  readonly seriesNumber: string;
  readonly imageType: string;
  readonly transferSyntax: string;
  readonly manufacturer: string;
  readonly convolutionKernel: string;
  readonly sliceCount: number;
  readonly rows: number;
  readonly columns: number;
  readonly pixelSpacingMm: string;
  readonly calculatedSliceSpacingMm: string;
  readonly sliceThicknessMm: string;
  readonly spacingBetweenSlicesMm: string;
  readonly imageOrientationPatient: string;
  readonly patientPosition: string;
  readonly orientationCode: string;
  readonly anatomicalAxes: string;
  readonly rescaleSlope: number;
  readonly rescaleIntercept: number;
  readonly bitsAllocated: number;
  readonly bitsStored: number;
  readonly highBit: number;
  readonly pixelRepresentation: number;
  readonly photometricInterpretation: string;
  readonly pixelPaddingValue: string;
  readonly volumeDimensionsVoxels: string;
  readonly physicalDimensionsMm: string;
  readonly minHU: number | null;
  readonly maxHU: number | null;
  readonly meanHU: number | null;
  readonly percentiles: Readonly<Record<string, number>> | null;
  readonly reconstructionStrategy: string;
  readonly spacingSource: string;
  readonly gantryTiltDeg: number;
  readonly duplicatePositions: number;
  readonly suspectedMissingSlices: number;
  readonly spacingMinMm: number;
  readonly spacingMaxMm: number;
}

const fmt = (n: number | undefined, digits = 4): string =>
  n === undefined || !Number.isFinite(n) ? '—' : n.toFixed(digits);

export function buildSeriesReport(
  series: SeriesSummary, analysis: GeometryAnalysis, stats: VolumeStatistics | null,
): SeriesReport {
  const g = analysis.geometry;
  const first = series.instances[0];
  return {
    studyInstanceUID: series.studyInstanceUID,
    seriesInstanceUID: series.seriesInstanceUID,
    frameOfReferenceUID: series.frameOfReferenceUID ?? '—',
    modality: series.modality,
    seriesDescription: series.seriesDescription ?? '—',
    seriesNumber: series.seriesNumber !== undefined ? String(series.seriesNumber) : '—',
    imageType: series.imageType.join('\\') || '—',
    transferSyntax: `${transferSyntax(series.transferSyntaxUID).name} (${series.transferSyntaxUID})`,
    manufacturer: [series.manufacturer, series.manufacturerModelName].filter(Boolean).join(' ') || '—',
    convolutionKernel: series.convolutionKernel ?? '—',
    sliceCount: analysis.slices.length,
    rows: series.rows,
    columns: series.columns,
    pixelSpacingMm: series.pixelSpacing ? `${fmt(series.pixelSpacing[0], 6)} \\ ${fmt(series.pixelSpacing[1], 6)} (row \\ column)` : '—',
    calculatedSliceSpacingMm: fmt(analysis.stats.spacingMedian, 6),
    sliceThicknessMm: fmt(series.sliceThickness, 3),
    spacingBetweenSlicesMm: fmt(series.spacingBetweenSlices, 3),
    imageOrientationPatient: series.imageOrientationPatient ? `[${series.imageOrientationPatient.join(', ')}]` : '—',
    patientPosition: series.patientPosition ?? '—',
    orientationCode: g ? orientationCode(g.iAxis, g.jAxis, g.kAxis) : '—',
    anatomicalAxes: g
      ? `+i → ${anatomicalLabel(g.iAxis)}, +j → ${anatomicalLabel(g.jAxis)}, +k → ${anatomicalLabel(g.kAxis)}`
      : '—',
    rescaleSlope: first.rescale.slope,
    rescaleIntercept: first.rescale.intercept,
    bitsAllocated: first.encoding.bitsAllocated,
    bitsStored: first.encoding.bitsStored,
    highBit: first.encoding.highBit,
    pixelRepresentation: first.encoding.pixelRepresentation,
    photometricInterpretation: first.encoding.photometricInterpretation,
    pixelPaddingValue: first.rescale.pixelPaddingValue !== undefined ? String(first.rescale.pixelPaddingValue) : 'not present',
    volumeDimensionsVoxels: g ? g.dimensions.join(' × ') : '—',
    physicalDimensionsMm: g
      ? `${g.physicalSize[0].toFixed(2)} × ${g.physicalSize[1].toFixed(2)} × ${g.physicalSize[2].toFixed(2)}`
      : '—',
    minHU: stats ? stats.min : null,
    maxHU: stats ? stats.max : null,
    meanHU: stats ? Number(stats.mean.toFixed(2)) : null,
    percentiles: stats
      ? Object.fromEntries(Object.entries(stats.percentiles).map(([k, v]) => [k, Math.round(v)]))
      : null,
    reconstructionStrategy: analysis.strategy,
    spacingSource: g ? g.spacingSource : '—',
    gantryTiltDeg: Number(analysis.stats.stackShearDeg.toFixed(4)),
    duplicatePositions: analysis.stats.duplicatePositions,
    suspectedMissingSlices: analysis.stats.suspectedMissingSlices,
    spacingMinMm: Number.isFinite(analysis.stats.spacingMin) ? Number(analysis.stats.spacingMin.toFixed(5)) : NaN,
    spacingMaxMm: Number.isFinite(analysis.stats.spacingMax) ? Number(analysis.stats.spacingMax.toFixed(5)) : NaN,
  };
}

export function formatSeriesReport(r: SeriesReport): string {
  const rows: Array<[string, string | number]> = [
    ['StudyInstanceUID', r.studyInstanceUID],
    ['SeriesInstanceUID', r.seriesInstanceUID],
    ['FrameOfReferenceUID', r.frameOfReferenceUID],
    ['Modality', r.modality],
    ['SeriesNumber', r.seriesNumber],
    ['SeriesDescription', r.seriesDescription],
    ['ImageType', r.imageType],
    ['Transfer syntax', r.transferSyntax],
    ['Scanner', r.manufacturer],
    ['Reconstruction kernel', r.convolutionKernel],
    ['Slice count', r.sliceCount],
    ['Rows', r.rows],
    ['Columns', r.columns],
    ['Pixel spacing (mm)', r.pixelSpacingMm],
    ['Calculated slice spacing (mm)', r.calculatedSliceSpacingMm],
    ['Slice thickness (mm)', r.sliceThicknessMm],
    ['SpacingBetweenSlices (mm)', r.spacingBetweenSlicesMm],
    ['Measured spacing min/max (mm)', `${r.spacingMinMm} / ${r.spacingMaxMm}`],
    ['Spacing source', r.spacingSource],
    ['ImageOrientationPatient', r.imageOrientationPatient],
    ['PatientPosition', r.patientPosition],
    ['Volume orientation code', r.orientationCode],
    ['Anatomical axes', r.anatomicalAxes],
    ['Gantry/stack shear (deg)', r.gantryTiltDeg],
    ['Duplicate slice positions', r.duplicatePositions],
    ['Suspected missing slices', r.suspectedMissingSlices],
    ['Reconstruction strategy', r.reconstructionStrategy],
    ['RescaleSlope', r.rescaleSlope],
    ['RescaleIntercept', r.rescaleIntercept],
    ['BitsAllocated / BitsStored / HighBit', `${r.bitsAllocated} / ${r.bitsStored} / ${r.highBit}`],
    ['PixelRepresentation', r.pixelRepresentation === 1 ? '1 (signed)' : '0 (unsigned)'],
    ['PhotometricInterpretation', r.photometricInterpretation],
    ['PixelPaddingValue', r.pixelPaddingValue],
    ['Volume dimensions (voxels)', r.volumeDimensionsVoxels],
    ['Physical dimensions (mm)', r.physicalDimensionsMm],
    ['HU minimum', r.minHU ?? '—'],
    ['HU maximum', r.maxHU ?? '—'],
    ['HU mean', r.meanHU ?? '—'],
  ];
  if (r.percentiles) {
    for (const [k, v] of Object.entries(r.percentiles)) rows.push([`HU ${k}`, v]);
  }
  const width = Math.max(...rows.map(([k]) => k.length));
  return rows.map(([k, v]) => `${k.padEnd(width)} : ${v}`).join('\n');
}
