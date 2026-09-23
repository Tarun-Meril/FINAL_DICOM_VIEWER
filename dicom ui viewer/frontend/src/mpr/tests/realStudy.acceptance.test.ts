/**
 * Acceptance run against the real Fatima Bhanpurwala CT ABD CONT study.
 * Drives the ACTUAL ported pipeline: parseFrames -> DICOMGeometry ->
 * SeriesValidator -> VolumeBuilder. No reimplementation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import dicomParser from 'dicom-parser';
import { frameDescriptorsFromDataSet, readPatientStudyInfo } from '../dicom/parseFrames';
import { buildSeriesGeometry } from '../core/geometry/DICOMGeometry';
import { prepareCandidateVolumes } from '../core/volume/SeriesValidator';
import { prepareVolume } from '../app/loadStudy';

// Point this at an unpacked study directory:
//   MPR_DATASET_DIR=/path/to/study npx vitest run realStudy.acceptance
const DIR = process.env.MPR_DATASET_DIR ?? '';

describe.skipIf(!DIR)('real dataset acceptance', () => {
  it('parses, groups, validates and builds a volume', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.dcm'));
    expect(files.length).toBeGreaterThan(0);

    const frames: any[] = [];
    const identities = new Map<string, any>();
    const failures: Array<{ f: string; why: string }> = [];

    for (const f of files) {
      try {
        const buf = new Uint8Array(readFileSync(join(DIR, f)));
        const ds = dicomParser.parseDicom(buf);
        const parsed = frameDescriptorsFromDataSet(ds, {
          makeId: (_sop: string, i: number) => (i > 0 ? `file:${f}?frame=${i}` : `file:${f}`),
        });
        if (parsed.length === 0) { failures.push({ f, why: 'no frames' }); continue; }
        frames.push(...parsed);
        const info = readPatientStudyInfo(ds);
        for (const fr of parsed) identities.set(fr.id, info);
      } catch (e: any) {
        failures.push({ f, why: e?.message ?? String(e) });
      }
    }

    console.log(`\n=== PARSE ===`);
    console.log(`files=${files.length} frames=${frames.length} failed=${failures.length}`);
    if (failures.length) console.log('failures:', failures.slice(0, 5));

    // --- identity consistency (the wrong-patient check) ---
    const names = new Set([...identities.values()].map((i) => i.patientName ?? '?'));
    const ids = new Set([...identities.values()].map((i) => i.patientId ?? '?'));
    console.log(`\n=== IDENTITY ===`);
    console.log('patientName(s):', [...names]);
    console.log('patientId(s):', [...ids]);
    console.log('identities registered:', identities.size, 'of', frames.length, 'frames');
    expect(identities.size).toBe(frames.length);

    // --- series grouping ---
    const { candidates, filter } = prepareCandidateVolumes(frames);
    console.log(`\n=== GROUPING ===`);
    console.log('candidate volumes:', candidates.length);
    console.log('filter:', JSON.stringify(filter, null, 2).slice(0, 900));
    for (const c of candidates) {
      console.log(`  series=${c.seriesInstanceUID} frames=${c.frames.length}`);
    }
    expect(candidates.length).toBeGreaterThan(0);

    // --- geometry + volume for each candidate ---
    console.log(`\n=== GEOMETRY / VOLUME ===`);
    let built = 0;
    for (const c of candidates) {
      // prepareVolume is the REAL caller used by MPRWorkspace.
      const prepared = prepareVolume(c);
      const geom = prepared.geometry;
      console.log(`\nseries ${c.seriesInstanceUID}`);
      console.log(`  desc="${c.frames[0]?.seriesDescription}" num=${c.frames[0]?.seriesNumber}`);
      console.log(`  modality=${geom.modality} n=${c.frames.length} verdict=${geom.verdict}`);
      console.log(`  spacing=${JSON.stringify(geom.spacing)} dims=${JSON.stringify(geom.dimensions)}`);
      for (const i of geom.issues ?? []) console.log(`  [${i.severity}] ${i.code}: ${i.message}`);
      if (prepared.blockingMessage) console.log(`  BLOCKED: ${prepared.blockingMessage}`);
      const d = prepared.descriptor;
      console.log(`  descriptor=${d ? 'BUILT' : 'REFUSED'}`);
      if (d) {
        built++;
        console.log(`  units=${d.units} rescale=${JSON.stringify(d.rescale)}`);
        console.log(`  imageIds=${prepared.imageIds.length}`);
        console.log(`  estimatedMB=${(d.estimatedBytes / 1e6).toFixed(1)}`);
      }
    }
    expect(built).toBeGreaterThan(0);
  }, 180000);
});
