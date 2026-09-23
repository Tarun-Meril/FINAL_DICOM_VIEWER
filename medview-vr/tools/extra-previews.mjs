/**
 * Two previews the main validation run cannot produce well:
 *
 *  A. Bone removed AND a soft-tissue transfer function applied — the actual clinical
 *     point of bone removal. (The main run leaves the bone preset active, so its
 *     "bone removed" frame is correctly but uninformatively empty.)
 *  B. A full-window screenshot of the workstation: toolbar, panels, viewport, overlays,
 *     orientation cube and status bar.
 *
 * usage: node tools/extra-previews.mjs <dicom-dir> [outDir]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { serve } from './server.mjs';

const DATASET = process.argv[2] ?? '/home/claude/work/dataset';
const OUT = process.argv[3] ?? path.resolve('validation-output');
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });

const files = fs.readdirSync(DATASET).map((f) => path.join(DATASET, f)).sort();
const { server, url } = await serve(path.resolve('dist'), 8124);
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update',
    '--no-first-run', '--js-flags=--max-old-space-size=4096'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.setDefaultTimeout(1800000);
await page.goto(url, { waitUntil: 'load' });
await page.setInputFiles('input[type=file]:not([webkitdirectory])', files);
await page.waitForFunction(() => !!window.__medview?.engine, undefined, { timeout: 1800000, polling: 1000 });
console.log('study loaded');

const save = async (name) => {
  const t = Date.now();
  const dataUrl = await page.evaluate(() => window.__medview.engine.capture({ format: 'image/png' }));
  fs.writeFileSync(path.join(OUT, 'screenshots', `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`  ${name}: ${((Date.now() - t) / 1000).toFixed(0)} s`);
};

/* ---- A. bone removal used for what it is for -------------------------- */
await page.evaluate(async () => {
  const mv = window.__medview;
  const s = mv.getSession();
  const bone = await mv.ops.boneRemoval();
  const t = bone.suggestBoneThreshold(s.volume);
  const res = bone.extractBone(s.volume, s.labels, 1, {
    thresholdHU: t.thresholdHU, minComponentVoxels: 500, dilateVoxels: 1,
  });
  for (const d of res.deltas) s.history.push({ delta: d, target: 'labels', at: Date.now() });
  const d = bone.removeBone(s.visibility.values, s.labels, 1);
  s.history.push({ delta: d, target: 'visibility', at: Date.now() });
  mv.syncDisplay(s);
  // The point of removing bone is to see what the bone was hiding.
  mv.store.getState().selectPreset('soft-tissue');
  mv.engine.applyCameraPreset('ant-left-45', false);
});
await page.waitForTimeout(400);
await save('21-bone-removed-soft-tissue');

/* ---- B. the workstation itself ---------------------------------------- */
await page.evaluate(async () => {
  const mv = window.__medview;
  const s = mv.getSession();
  s.visibility.reset();
  mv.syncDisplay(s);
  const st = mv.store.getState();
  st.selectPreset('bone');
  st.setActivePanel('diagnostics');
  st.setQuality('standard');
  mv.engine.applyCameraPreset('ant-left-45', false);
  mv.engine.setQuality('standard');
  mv.engine.renderNow();
});
// Force the deferred GL work to complete so the canvas holds a finished frame.
await page.evaluate(() => window.__medview.engine.capture({ format: 'image/png' }));
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, 'screenshots', '22-workstation-ui.png') });
console.log('  22-workstation-ui: captured');

await browser.close();
server.close();
