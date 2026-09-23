/** Copy the codec WASM binaries next to the app so the emscripten glue can fetch them.
 *  Also ensures the JS glue files export their factory function as ESM for workers.
 *  Run automatically before dev/build; see package.json scripts. */
import fs from 'node:fs';
import path from 'node:path';

const targets = [
  ['@cornerstonejs/codec-openjpeg', 'dist/openjpegwasm_decode.wasm'],
  ['@cornerstonejs/codec-charls', 'dist/charlswasm_decode.wasm'],
  ['@cornerstonejs/codec-libjpeg-turbo-8bit', 'dist/libjpegturbowasm_decode.wasm'],
];
const out = path.resolve('public/wasm');
fs.mkdirSync(out, { recursive: true });
for (const [pkg, rel] of targets) {
  const src = path.resolve('node_modules', pkg, rel);
  if (!fs.existsSync(src)) { console.warn('missing wasm:', src); continue; }
  const dest = path.join(out, path.basename(src));
  fs.copyFileSync(src, dest);
  console.log('copied', path.basename(src), (fs.statSync(dest).size / 1024).toFixed(0) + ' kB');
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
    console.log('patched ESM exports for', path.basename(src));
  }
}
