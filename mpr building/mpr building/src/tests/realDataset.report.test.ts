/**
 * Ad-hoc report over a real study directory. Not part of the regression suite:
 * it only runs when MPR_DATASET_DIR points at a folder of DICOM files.
 *
 *   MPR_DATASET_DIR=/path/to/study npx vitest run src/tests/realDataset.report.test.ts
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFrameDescriptors, readPatientStudyInfo } from '../dicom/parseFrames';
import dicomParser from 'dicom-parser';
import { prepareCandidateVolumes } from '../core/volume/SeriesValidator';
import { buildSeriesGeometry } from '../core/geometry/DICOMGeometry';
import { createVolumeDescriptor } from '../core/volume/VolumeBuilder';
import { SpatialTransform } from '../core/geometry/SpatialTransform';
import { classifyAcquisitionPlane } from '../core/geometry/DICOMGeometry';
import type { FrameDescriptor } from '../core/geometry/types';

const dir = process.env.MPR_DATASET_DIR;

describe.skipIf(!dir)('Real study report', () => {
  it('parses, validates and reports every candidate volume', () => {
    const files = readdirSync(dir as string)
      .filter((f) => statSync(join(dir as string, f)).isFile())
      .sort();

    const frames: FrameDescriptor[] = [];
    const failed: string[] = [];
    let info: ReturnType<typeof readPatientStudyInfo> | null = null;

    for (const name of files) {
      try {
        const bytes = new Uint8Array(readFileSync(join(dir as string, name)));
        const ds = dicomParser.parseDicom(bytes);
        if (!info) info = readPatientStudyInfo(ds);
        frames.push(
          ...parseFrameDescriptors(bytes, {
            makeId: (_sop, f) => `dicomfile:${name}?frame=${f}`,
          }),
        );
      } catch (error) {
        failed.push(`${name}: ${error instanceof Error ? error.message : error}`);
      }
    }

    const lines: string[] = [];
    lines.push('='.repeat(78));
    lines.push(`Files on disk        ${files.length}`);
    lines.push(`Frames parsed        ${frames.length}`);
    lines.push(`Unparseable files    ${failed.length}`);
    for (const f of failed.slice(0, 5)) lines.push(`  ${f}`);
    lines.push(`Patient              ${info?.patientName ?? '-'} (${info?.patientId ?? '-'})`);
    lines.push(`Study                ${info?.studyDate ?? '-'}  ${info?.studyDescription ?? '-'}`);
    lines.push(`Patient position     ${info?.patientPosition ?? '-'}`);

    const { candidates, filter } = prepareCandidateVolumes(frames);
    lines.push('');
    lines.push(`Excluded (non-volumetric)  ${filter.excluded.length}`);
    const reasons = new Map<string, number>();
    for (const e of filter.excluded) {
      reasons.set(e.reason, (reasons.get(e.reason) ?? 0) + 1);
      }
    for (const [r, c] of reasons) lines.push(`  ${r}: ${c}`);
    lines.push(`Candidate volumes          ${candidates.length}`);
    lines.push('');

    for (const group of candidates) {
      lines.push('-'.repeat(78));
      lines.push(
        `SERIES ${group.seriesNumber ?? '-'}  "${group.seriesDescription ?? '-'}"  ` +
          `${group.modality}  ${group.columns}x${group.rows}x${group.frames.length}` +
          (group.convolutionKernel ? `  kernel=${group.convolutionKernel}` : '') +
          (group.acquisitionNumber !== undefined ? `  acq=${group.acquisitionNumber}` : ''),
      );
      const g = buildSeriesGeometry(group.frames);
      lines.push(`  verdict            ${g.verdict}`);
      lines.push(`  dimensions         ${g.dimensions.join(' x ')}`);
      lines.push(`  spacing (mm)       ${g.spacing.map((v) => v.toFixed(4)).join(' x ')}`);
      lines.push(`  origin (mm)        ${g.origin.map((v) => v.toFixed(2)).join(', ')}`);
      lines.push(`  row dir            ${g.rowDirection.map((v) => v.toFixed(4)).join(', ')}`);
      lines.push(`  col dir            ${g.columnDirection.map((v) => v.toFixed(4)).join(', ')}`);
      lines.push(`  slice normal       ${g.sliceNormal.map((v) => v.toFixed(4)).join(', ')}`);
      lines.push(
        `  acquisition plane  ${g.acquisitionPlane}${g.oblique ? ' (OBLIQUE)' : ''}  ` +
          `deviation ${classifyAcquisitionPlane(g.sliceNormal).plane}`,
      );
      lines.push(
        `  gap min/med/max    ${g.spacingAnalysis.minGap?.toFixed(4)} / ` +
          `${g.spacingAnalysis.medianGap?.toFixed(4)} / ${g.spacingAnalysis.maxGap?.toFixed(4)} mm`,
      );
      lines.push(
        `  spacing regular    ${g.spacingAnalysis.regular}  ` +
          `maxDev ${(g.spacingAnalysis.maxRelativeDeviation * 100).toFixed(3)}%  ` +
          `missing ${g.spacingAnalysis.estimatedMissingCount}`,
      );
      lines.push(
        `  declared thk/space ${group.frames[0].sliceThickness ?? '-'} / ` +
          `${group.frames[0].spacingBetweenSlices ?? '-'} mm`,
      );
      lines.push(
        `  gantry shear       ${g.gantryTilt.shearAngleDeg.toFixed(4)} deg  ` +
          `sheared=${g.gantryTilt.sheared}`,
      );

      if (g.verdict !== 'unsafe') {
        const v = createVolumeDescriptor('real', g);
        const t = new SpatialTransform(g);
        lines.push(
          `  rescale            slope ${v.rescale.slope}  intercept ${v.rescale.intercept}  units ${v.units}`,
        );
        lines.push(
          `  physical size      ${t.physicalSizeMm.map((n) => n.toFixed(1)).join(' x ')} mm`,
        );
        lines.push(`  volume memory      ${(v.estimatedBytes / 1048576).toFixed(1)} MB`);
        // index <-> world round trip on the real geometry
        let worst = 0;
        for (const idx of [
          [0, 0, 0],
          [g.dimensions[0] - 1, g.dimensions[1] - 1, g.dimensions[2] - 1],
          [123.5, 77.25, 13.75],
        ] as Array<[number, number, number]>) {
          const w = t.indexToWorld(idx);
          const back = t.worldToIndex(w);
          worst = Math.max(
            worst,
            Math.abs(back[0] - idx[0]),
            Math.abs(back[1] - idx[1]),
            Math.abs(back[2] - idx[2]),
          );
        }
        lines.push(`  index round trip   max error ${worst.toExponential(3)} voxels`);
      }

      for (const i of g.issues) {
        lines.push(`  [${i.severity}] ${i.code}`);
        lines.push(`       ${i.message}`);
        lines.push(`       ${i.detail}`);
      }
    }
    lines.push('='.repeat(78));

    console.log('\n' + lines.join('\n'));
    expect(frames.length).toBeGreaterThan(0);
  }, 300000);
});
