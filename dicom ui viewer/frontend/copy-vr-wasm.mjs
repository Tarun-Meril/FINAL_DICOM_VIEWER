/**
 * Stage the MedView VR codec WASM binaries into public/wasm.
 *
 * REQUIRED for the integrated 3D VR mode. The VR ingest path decodes DICOM with
 * its own emscripten codecs (OpenJPEG / CharLS / libjpeg-turbo), independent of
 * the Cornerstone decoder used by the 2D viewer and MPR. The emscripten glue
 * resolves its .wasm relative to the bundled script — which Vite content-hashes
 * — so `codecs.ts` points locateFile() at `<base>wasm/<file>` and this script
 * puts the binaries there.
 *
 * It also appends ESM default exports to the codec glue files, which ship as
 * UMD and cannot otherwise be imported from a module worker.
 *
 * This PACS sends JPEG 2000 Lossless (1.2.840.10008.1.2.4.90) for every frame,
 * so without the OpenJPEG binary the VR viewer loads but renders nothing. The
 * script therefore FAILS LOUDLY rather than warning: a silent partial stage is
 * how you end up debugging a blank 3D viewport.
 *
 * Wired into `npm run dev` and `npm run build` via the `prepare:wasm` script.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Codecs whose absence breaks a transfer syntax this PACS actually sends. */
const REQUIRED = new Set(['@cornerstonejs/codec-openjpeg']);

const targets = [
  ['@cornerstonejs/codec-openjpeg', 'dist/openjpegwasm_decode.wasm', 'JPEG 2000 (1.2.840.10008.1.2.4.90/.91)'],
  ['@cornerstonejs/codec-charls', 'dist/charlswasm_decode.wasm', 'JPEG-LS (1.2.840.10008.1.2.4.80/.81)'],
  ['@cornerstonejs/codec-libjpeg-turbo-8bit', 'dist/libjpegturbowasm_decode.wasm', 'JPEG baseline (1.2.840.10008.1.2.4.50)'],
];

const out = path.resolve('public/wasm');
fs.mkdirSync(out, { recursive: true });

const missing = [];
let copied = 0;

for (const [pkg, rel, why] of targets) {
  const src = path.resolve('node_modules', pkg, rel);
  if (!fs.existsSync(src)) {
    missing.push({ pkg, rel, why, required: REQUIRED.has(pkg) });
    continue;
  }
  const dest = path.join(out, path.basename(src));
  fs.copyFileSync(src, dest);
  copied++;
  console.log(`  staged ${path.basename(src)}  ${(fs.statSync(dest).size / 1024).toFixed(0)} kB  — ${why}`);
}

const jsTargets = [
  ['@cornerstonejs/codec-openjpeg', 'dist/openjpegwasm_decode.js', 'OpenJPEGWASM'],
  ['@cornerstonejs/codec-openjpeg', 'dist/openjpegjs_decode.js', 'OpenJPEGJS'],
  ['@cornerstonejs/codec-charls', 'dist/charlswasm_decode.js', 'CharLSWASM'],
  ['@cornerstonejs/codec-charls', 'dist/charlsjs_decode.js', 'CharLS'],
  ['@cornerstonejs/codec-libjpeg-turbo-8bit', 'dist/libjpegturbowasm_decode.js', 'libjpegturbowasm_decode'],
  ['@cornerstonejs/codec-libjpeg-turbo-8bit', 'dist/libjpegturbojs_decode.js', 'libjpegturbojs_decode'],
];

for (const [pkg, rel, exportName] of jsTargets) {
  const src = path.resolve('node_modules', pkg, rel);
  if (!fs.existsSync(src)) continue;
  let content = fs.readFileSync(src, 'utf8');
  if (!content.includes(`export default ${exportName}`)) {
    content += `\nexport default ${exportName};\nexport { ${exportName} };\n`;
    fs.writeFileSync(src, content, 'utf8');
    console.log(`  patched ESM exports for ${path.basename(src)}`);
  }
}

const fatal = missing.filter((m) => m.required);
if (fatal.length > 0) {
  console.error('\nVR codec staging FAILED — the 3D viewer cannot decode this PACS.\n');
  for (const m of fatal) {
    console.error(`  missing: node_modules/${m.pkg}/${m.rel}`);
    console.error(`  needed for: ${m.why}\n`);
  }
  console.error('Install the VR dependencies first:\n');
  console.error('  npm i @kitware/vtk.js zustand fflate jpeg-lossless-decoder-js \\');
  console.error('        @cornerstonejs/codec-openjpeg @cornerstonejs/codec-charls \\');
  console.error('        @cornerstonejs/codec-libjpeg-turbo-8bit\n');
  process.exit(1);
}

for (const m of missing) {
  console.warn(`  note: ${m.pkg} not installed — ${m.why} will be unavailable in VR.`);
}

console.log(`\nVR codecs staged into public/wasm (${copied}/${targets.length}).`);
