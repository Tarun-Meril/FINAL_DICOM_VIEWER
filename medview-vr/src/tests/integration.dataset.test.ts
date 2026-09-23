/**
 * Integration test against a real DICOM study (§37).
 *
 * Point MEDVIEW_TEST_DATASET at a directory or archive of DICOM files. The test is
 * skipped when no dataset is configured, so the suite stays runnable anywhere.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { inventory, buildVolumeFromSeries, type InventoryResult, type BuildResult } from '@/dicom/ingest';
import { buildSeriesReport, formatSeriesReport } from '@/dicom/diagnostics';
import { orientationCode } from '@/dicom/geometry';
import { suggestBoneThreshold, extractBone } from '@/segmentation/boneRemoval';
import { LabelVolume } from '@/segmentation/labelVolume';
import { chooseInitialPreset, adaptPresetToVolume } from '@/rendering/presets';
import { evaluateOpacity } from '@/rendering/transferFunction';

const DATASET = process.env.MEDVIEW_TEST_DATASET ?? '/home/claude/work/dataset';
const available = fs.existsSync(DATASET);

function readAll(target: string): Array<{ path: string; bytes: Uint8Array }> {
  const st = fs.statSync(target);
  if (st.isFile()) return [{ path: path.basename(target), bytes: new Uint8Array(fs.readFileSync(target)) }];
  const out: Array<{ path: string; bytes: Uint8Array }> = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push({ path: path.relative(target, p), bytes: new Uint8Array(fs.readFileSync(p)) });
    }
  };
  walk(target);
  return out;
}

describe.skipIf(!available)('real dataset end-to-end', () => {
  let inv: InventoryResult;
  let build: BuildResult;

  beforeAll(async () => {
    inv = await inventory(readAll(DATASET));
    expect(inv.selected).not.toBeNull();
    build = await buildVolumeFromSeries(inv.selected!, inv.bytesByFileId);
  }, 600000);

  it('detects every DICOM file without relying on extensions', () => {
    expect(inv.diagnostics.validDicomFiles).toBeGreaterThan(0);
    expect(inv.diagnostics.validDicomFiles + inv.diagnostics.rejectedFiles.length)
      .toBe(inv.diagnostics.filesAfterArchiveExpansion);
  });

  it('separates studies and series', () => {
    expect(inv.diagnostics.studyCount).toBeGreaterThanOrEqual(1);
    expect(inv.diagnostics.seriesCount).toBeGreaterThanOrEqual(1);
  });

  it('selects a CT volumetric series and explains the choice', () => {
    expect(inv.selected!.modality).toBe('CT');
    expect(inv.selected!.role).toBe('volumetric');
    expect(inv.diagnostics.selectionReason).toMatch(/scored/);
  });

  it('excludes non-volumetric series from the candidate set', () => {
    const roles = inv.studies.flatMap((s) => s.series).map((s) => s.role);
    for (const s of inv.studies.flatMap((x) => x.series)) {
      if (s.role !== 'volumetric') expect(s.volumeScore).toBe(0);
    }
    expect(roles.length).toBeGreaterThanOrEqual(1);
  });

  it('passes every geometry conformance check', () => {
    for (const c of build.conformance.checks) {
      expect(c.pass, `${c.name}: expected ${c.expected}, got ${c.actual}`).toBe(true);
    }
  });

  it('produces a right-handed LPS volume', () => {
    const g = build.volume.geometry;
    expect(g.handedness).toBe(1);
    expect(orientationCode(g.iAxis, g.jAxis, g.kAxis)).toHaveLength(3);
  });

  it('derives slice spacing from image positions', () => {
    expect(build.volume.geometry.spacingSource).toBe('measured');
    expect(build.analysis.stats.spacingMedian).toBeGreaterThan(0);
  });

  it('verifies HU conversion against an independent recomputation', () => {
    expect(build.huVerification.checked).toBeGreaterThan(0);
    expect(build.huVerification.mismatches).toBe(0);
    const [lo, hi] = build.huVerification.theoreticalRange;
    expect(build.volume.statistics.min).toBeGreaterThanOrEqual(lo - 1);
    expect(build.volume.statistics.max).toBeLessThanOrEqual(hi + 1);
  });

  it('produces a plausible CT HU distribution', () => {
    const s = build.volume.statistics;
    expect(s.min).toBeLessThanOrEqual(-900);       // air is present
    expect(s.max).toBeGreaterThan(300);            // dense material is present
    expect(s.histogram.total).toBe(build.volume.scalars.length);
  });

  it('fills every acquired slice of the volume', () => {
    const dims = build.volume.geometry.dimensions;
    expect(build.volume.scalars.length).toBe(dims[0] * dims[1] * dims[2]);
    expect(build.volume.provenance.sourceInstanceCount).toBe(build.analysis.slices.length);
  });

  it('keeps the source volume immutable through a segmentation pass', () => {
    const checksum = (a: Int16Array) => { let h = 0; for (let i = 0; i < a.length; i += 1021) h = (h * 31 + a[i]) | 0; return h; };
    const before = checksum(build.volume.scalars);
    const labels = new LabelVolume(build.volume.geometry.dimensions);
    const t = suggestBoneThreshold(build.volume);
    const r = extractBone(build.volume, labels, 1, { thresholdHU: t.thresholdHU, minComponentVoxels: 200 });
    expect(r.voxelCount).toBeGreaterThan(0);
    expect(checksum(build.volume.scalars)).toBe(before);
  }, 300000);

  it('chooses an initial preset that is not blank on this data', () => {
    const { preset } = chooseInitialPreset(build.volume.statistics, build.contrast.likely);
    const { tf } = adaptPresetToVolume(preset, build.volume.statistics);
    // Some voxel in the volume must be assigned non-zero opacity, or the viewport
    // would open black (§32).
    const p999 = build.volume.statistics.percentiles.p999;
    expect(evaluateOpacity(tf, p999)).toBeGreaterThan(0);
  });

  it('produces a complete series report', () => {
    const text = formatSeriesReport(buildSeriesReport(inv.selected!, build.analysis, build.volume.statistics));
    for (const field of ['StudyInstanceUID', 'SeriesInstanceUID', 'FrameOfReferenceUID', 'Modality',
      'Slice count', 'Pixel spacing (mm)', 'Calculated slice spacing (mm)', 'RescaleSlope',
      'RescaleIntercept', 'Volume dimensions (voxels)', 'Physical dimensions (mm)', 'HU minimum', 'HU maximum']) {
      expect(text).toContain(field);
    }
  });

  it('records reproducible provenance', () => {
    const p = build.volume.provenance;
    expect(p.seriesInstanceUID).toBe(inv.selected!.seriesInstanceUID);
    expect(p.reconstructionStrategy).toBeTruthy();
    expect(p.sourceSopInstanceUIDs).toHaveLength(build.analysis.slices.length);
  });
});
