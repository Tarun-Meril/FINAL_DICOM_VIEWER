/**
 * End-to-end DICOM round trip.
 *
 * Generates real DICOM P10 files with tools/make-phantom.mjs, parses them with
 * the production adapter, and validates the geometry the viewer would build.
 * This exercises the whole non-GPU half of the pipeline against actual bytes
 * rather than hand-built descriptors.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseFrameDescriptors } from '../dicom/parseFrames';
import { buildSeriesGeometry } from '../core/geometry/DICOMGeometry';
import { SpatialTransform } from '../core/geometry/SpatialTransform';
import { excludeNonVolumetricFrames } from '../core/volume/SeriesValidator';
import { createVolumeDescriptor } from '../core/volume/VolumeBuilder';
import { measureLengthMm } from '../core/measurement/measurement';
import type { FrameDescriptor } from '../core/geometry/types';

const tempDirs: string[] = [];

function generate(args: string[]): FrameDescriptor[] {
  const dir = mkdtempSync(join(tmpdir(), 'mpr-phantom-'));
  tempDirs.push(dir);
  execFileSync(process.execPath, ['tools/make-phantom.mjs', dir, ...args], {
    stdio: 'pipe',
  });
  const files = readdirSync(dir).filter((f) => f.endsWith('.dcm')).sort();
  const frames: FrameDescriptor[] = [];
  for (const name of files) {
    const bytes = new Uint8Array(readFileSync(join(dir, name)));
    frames.push(
      ...parseFrameDescriptors(bytes, {
        makeId: (sop, frame) => `dicomfile:${sop}?frame=${frame}`,
      }),
    );
  }
  return frames;
}

afterAll(() => {
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
});

describe('End-to-end: real DICOM bytes through the production pipeline', () => {
  const frames = generate(['--slices', '40', '--spacing', '0.7,0.7,2.5']);

  it('parses every slice', () => {
    expect(frames).toHaveLength(40);
  });

  it('reads geometry tags correctly', () => {
    const g = buildSeriesGeometry(frames);
    expect(g.verdict).not.toBe('unsafe');
    expect(g.dimensions).toEqual([256, 256, 40]);
    expect(g.spacing[0]).toBeCloseTo(0.7, 6);
    expect(g.spacing[1]).toBeCloseTo(0.7, 6);
    expect(g.spacing[2]).toBeCloseTo(2.5, 6);
    expect(g.modality).toBe('CT');
    expect(g.acquisitionPlane).toBe('axial');
  });

  it('honours the CT rescale transform', () => {
    const g = buildSeriesGeometry(frames);
    const v = createVolumeDescriptor('phantom', g);
    expect(v.rescale.slope).toBe(1);
    expect(v.rescale.intercept).toBe(-1024);
    expect(v.units).toBe('HU');
  });

  it('measures the phantom bars at 50 mm in patient space', () => {
    const g = buildSeriesGeometry(frames);
    const t = new SpatialTransform(g);
    // The X bar spans x = -25..+25 mm at y = 0, z = 0 in patient coordinates.
    const a = t.clampWorld([-25, 0, 0]);
    const b = t.clampWorld([25, 0, 0]);
    expect(measureLengthMm(a, b)).toBeCloseTo(50, 6);
  });

  it('keeps the volume centred on the patient origin', () => {
    const g = buildSeriesGeometry(frames);
    const t = new SpatialTransform(g);
    const index = t.worldToIndex([0, 0, 0]);
    expect(index[0]).toBeCloseTo((256 - 1) / 2, 6);
    expect(index[1]).toBeCloseTo((256 - 1) / 2, 6);
  });
});

describe('End-to-end: oblique acquisition', () => {
  const frames = generate(['--slices', '30', '--oblique', '20']);

  it('recovers the true 20 degree obliquity from the written cosines', () => {
    const g = buildSeriesGeometry(frames);
    const tiltFromZ = (Math.acos(Math.abs(g.sliceNormal[2])) * 180) / Math.PI;
    expect(tiltFromZ).toBeCloseTo(20, 4);
    expect(g.oblique).toBe(true);
    expect(g.verdict).not.toBe('unsafe');
  });
});

describe('End-to-end: gantry-tilted acquisition', () => {
  const frames = generate(['--slices', '30', '--tilt', '15', '--spacing', '0.7,0.7,2']);

  it('detects the shear from the real Image Position values', () => {
    const g = buildSeriesGeometry(frames);
    expect(g.gantryTilt.sheared).toBe(true);
    expect(g.gantryTilt.shearAngleDeg).toBeCloseTo(15, 3);
    expect(g.issues.some((i) => i.code === 'GANTRY_TILT_SHEAR')).toBe(true);
  });
});

describe('End-to-end: missing slice', () => {
  const frames = generate(['--slices', '40', '--missing', '20']);

  it('refuses the series instead of interpolating across the gap', () => {
    const g = buildSeriesGeometry(frames);
    expect(g.verdict).toBe('unsafe');
    const issue = g.issues.find((i) => i.code === 'MISSING_SLICES');
    expect(issue?.severity).toBe('error');
    expect(g.spacingAnalysis.estimatedMissingCount).toBe(1);
  });
});

describe('End-to-end: MR series', () => {
  const frames = generate(['--slices', '24', '--modality', 'MR', '--spacing', '0.5,0.5,3']);

  it('builds MR geometry and reports arbitrary intensity units', () => {
    const g = buildSeriesGeometry(frames);
    const v = createVolumeDescriptor('mr', g);
    expect(g.modality).toBe('MR');
    expect(v.units).toBe('arbitrary');
    expect(g.spacing[2]).toBeCloseTo(3, 6);
  });

  it('accepts the frames as volumetric', () => {
    expect(excludeNonVolumetricFrames(frames).accepted).toHaveLength(24);
  });
});
