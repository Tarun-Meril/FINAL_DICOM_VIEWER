/**
 * Node harness: run the real ingestion pipeline over a directory or archive and print
 * the §3 / §35 diagnostics. Uses the exact same source modules as the browser app.
 */
import fs from 'node:fs';
import path from 'node:path';
import { inventory, buildVolumeFromSeries } from '@/dicom/ingest';
import { buildSeriesReport, formatSeriesReport } from '@/dicom/diagnostics';
import { logger } from '@/core/logger';

function collect(target: string): Array<{ path: string; bytes: Uint8Array }> {
  const st = fs.statSync(target);
  if (st.isFile()) return [{ path: path.basename(target), bytes: new Uint8Array(fs.readFileSync(target)) }];
  const out: Array<{ path: string; bytes: Uint8Array }> = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out.push({ path: path.relative(target, p), bytes: new Uint8Array(fs.readFileSync(p)) });
    }
  };
  walk(target);
  return out;
}

const target = process.argv[2];
if (!target) { console.error('usage: vite-node tools/ingest-report.ts <dir-or-archive>'); process.exit(2); }

const t0 = Date.now();
const files = collect(target);
console.log(`read ${files.length} file(s) from ${target} in ${Date.now() - t0} ms`);

const inv = await inventory(files, (e) => {
  if (e.done % 100 === 0 || e.phase !== 'scan') process.stdout.write(`\r  ${e.message}${' '.repeat(20)}`);
});
process.stdout.write('\n');

console.log('\n================ DATASET DIAGNOSTICS ================');
console.log('files supplied              :', inv.diagnostics.filesFound);
console.log('files after archive expansion:', inv.diagnostics.filesAfterArchiveExpansion);
console.log('valid DICOM files           :', inv.diagnostics.validDicomFiles);
console.log('rejected files              :', inv.diagnostics.rejectedFiles.length);
for (const r of inv.diagnostics.rejectedFiles.slice(0, 10)) console.log('   -', r.path, '→', r.reason);
console.log('studies                     :', inv.diagnostics.studyCount);
console.log('series                      :', inv.diagnostics.seriesCount);
console.log('timings (ms)                :', JSON.stringify(inv.diagnostics.timings));

for (const study of inv.studies) {
  console.log(`\nSTUDY ${study.studyInstanceUID}  "${study.studyDescription ?? ''}"`);
  for (const s of study.series) {
    console.log(`  · Series ${s.seriesNumber} "${s.seriesDescription}" [${s.modality}] ` +
      `${s.instanceCount} inst, ${s.columns}×${s.rows}, role=${s.role}, score=${s.volumeScore.toFixed(3)}`);
    for (const r of s.scoreReasons) console.log(`      ${r}`);
  }
}

console.log('\nSELECTED:', inv.diagnostics.selectedSeriesUID);
console.log('REASON  :', inv.diagnostics.selectionReason);

if (!inv.selected) process.exit(1);

const build = await buildVolumeFromSeries(inv.selected, inv.bytesByFileId, {
  onProgress: (e) => { if (e.done % 50 === 0 || e.phase !== 'decode') process.stdout.write(`\r  ${e.message}${' '.repeat(20)}`); },
});
process.stdout.write('\n');

console.log('\n================ SERIES REPORT ================');
console.log(formatSeriesReport(buildSeriesReport(inv.selected, build.analysis, build.volume.statistics)));

console.log('\n================ GEOMETRY CONFORMANCE ================');
for (const c of build.conformance.checks) {
  console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}`);
  console.log(`        expected ${c.expected} | actual ${c.actual}${c.toleranceNote ? ` | ${c.toleranceNote}` : ''}`);
}

console.log('\n================ HU VERIFICATION ================');
console.log('sampled voxels checked :', build.huVerification.checked);
console.log('mismatches             :', build.huVerification.mismatches);
console.log('encoding can represent :', build.huVerification.theoreticalRange.join(' … '), 'HU');

console.log('\n================ ISSUES ================');
if (build.volume.issues.length === 0) console.log('(none)');
for (const i of build.volume.issues) console.log(`[${i.severity.toUpperCase()}] ${i.code}: ${i.message}${i.detail ? `\n        ${i.detail}` : ''}`);

console.log('\n================ TIMINGS ================');
console.log(JSON.stringify({ ...inv.diagnostics.timings, ...build.timings }, null, 1));
console.log('\nlog tail:');
console.log(logger.export().split('\n').slice(-6).join('\n'));

fs.mkdirSync('/home/claude/work/out', { recursive: true });
fs.writeFileSync('/home/claude/work/out/volume.raw', Buffer.from(build.volume.scalars.buffer));
fs.writeFileSync('/home/claude/work/out/volume.json', JSON.stringify({
  geometry: build.volume.geometry,
  statistics: { ...build.volume.statistics, histogram: { ...build.volume.statistics.histogram, counts: Array.from(build.volume.statistics.histogram.counts) } },
  provenance: build.volume.provenance,
  report: buildSeriesReport(inv.selected, build.analysis, build.volume.statistics),
  conformance: build.conformance.checks,
  issues: build.volume.issues,
  contrast: build.contrast,
  timings: { ...inv.diagnostics.timings, ...build.timings },
  diagnostics: {
    ...inv.diagnostics,
    studies: inv.studies.map((st) => ({ ...st, series: st.series.map((se) => ({ ...se, instances: undefined, instanceCount: se.instances.length })) })),
  },
}, null, 1));
console.log('\nwrote /home/claude/work/out/volume.raw and volume.json');
