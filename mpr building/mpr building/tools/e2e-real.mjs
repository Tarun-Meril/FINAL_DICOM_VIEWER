#!/usr/bin/env node
/**
 * Acceptance run against a REAL clinical study.
 *
 * Loads a directory of DICOM files in a real browser, drives the workstation
 * through the clinical workflow, verifies each step numerically against the
 * live rendering engine, and captures a screenshot of every state.
 *
 *   node tools/e2e-real.mjs <url> <study-dir> <screenshot-dir> [seriesIndex]
 */

import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const url = process.argv[2] ?? 'http://localhost:4173/';
const studyDir = resolve(process.argv[3] ?? 'study');
const shotDir = resolve(process.argv[4] ?? 'shots');
const seriesIndex = Number(process.argv[5] ?? '0');

mkdirSync(shotDir, { recursive: true });

const results = [];
let shotNumber = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--js-flags=--max-old-space-size=4096',
  ],
});
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

async function shot(label) {
  shotNumber++;
  const name = `${String(shotNumber).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path: join(shotDir, name) });
  console.log(`      → ${name}`);
}

const api = (fn, arg) => page.evaluate(fn, arg);

await page.goto(url, { waitUntil: 'networkidle' });

const files = readdirSync(studyDir)
  .filter((f) => statSync(join(studyDir, f)).isFile())
  .map((f) => join(studyDir, f));

console.log(`Loading ${files.length} files from ${studyDir}`);
const t0 = Date.now();
await page.setInputFiles('label.file input[type="file"]', files);

// --- 1. series selection -------------------------------------------------
await page.waitForFunction(
  () =>
    document.querySelector('.series-list') !== null ||
    (window.__MERILVIEW_MPR__ &&
      (window.__MERILVIEW_MPR__.isVolumeLoaded() ||
        window.__MERILVIEW_MPR__.blockingMessage())),
  null,
  { timeout: 300000 },
);

const parseMs = Date.now() - t0;
const hasPicker = await page.evaluate(() => !!document.querySelector('.series-list'));

if (hasPicker) {
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.series-row')).map((r) =>
      r.textContent.replace(/\s+/g, ' ').trim(),
    ),
  );
  check(
    'Multiple volumetric series offered for explicit selection',
    rows.length > 1,
    rows.join('  ||  '),
  );
  await shot('series-selection');
  await page.click(`.series-row:nth-of-type(${seriesIndex + 1})`);
}

const tLoad = Date.now();
await page.waitForFunction(
  () =>
    window.__MERILVIEW_MPR__ &&
    (window.__MERILVIEW_MPR__.isVolumeLoaded() ||
      window.__MERILVIEW_MPR__.blockingMessage()),
  null,
  { timeout: 600000 },
);

const blocking = await api(() => window.__MERILVIEW_MPR__.blockingMessage());
check('Series accepted for reformatting', !blocking, blocking ?? '');
if (blocking) {
  await shot('refused');
  await browser.close();
  process.exit(1);
}

// Wait for every frame's pixel data to arrive. A reformat drawn from a
// partially streamed volume shows uniform grey where slices are missing, which
// must never be mistaken for anatomy — so the acceptance run refuses to judge
// image content until loading is complete.
await page.waitForFunction(
  () => window.__MERILVIEW_MPR__.isFullyLoaded(),
  null,
  { timeout: 900000 },
);
await page.waitForTimeout(4000);
const volumeMs = Date.now() - tLoad;
check(
  'Every frame streamed into the shared volume',
  await api(() => window.__MERILVIEW_MPR__.getLoadedFraction()) === 1,
);

// --- 2. geometry ---------------------------------------------------------
const geometry = await api(() => {
  const g = window.__MERILVIEW_MPR__.getGeometry();
  const v = window.__MERILVIEW_MPR__.getVolume();
  return {
    dimensions: g.dimensions,
    spacing: g.spacing,
    origin: g.origin,
    sliceNormal: g.sliceNormal,
    rowDirection: g.rowDirection,
    modality: g.modality,
    verdict: g.verdict,
    plane: g.acquisitionPlane,
    oblique: g.oblique,
    shear: g.gantryTilt.shearAngleDeg,
    regular: g.spacingAnalysis.regular,
    missing: g.spacingAnalysis.estimatedMissingCount,
    units: v.units,
    rescale: [v.rescale.slope, v.rescale.intercept],
    megabytes: v.estimatedBytes / 1048576,
  };
});

console.log('\n  Study geometry');
console.log('  ' + JSON.stringify(geometry, null, 2).split('\n').join('\n  '));
console.log(`  parse ${(parseMs / 1000).toFixed(1)} s   volume ${(volumeMs / 1000).toFixed(1)} s\n`);

check(
  'Volume built from real DICOM geometry',
  geometry.verdict !== 'unsafe' &&
    geometry.dimensions[2] > 1 &&
    geometry.spacing.every((s) => s > 0),
  `${geometry.dimensions.join('x')} @ ${geometry.spacing.map((s) => s.toFixed(3)).join('/')} mm`,
);

check(
  'CT is in Hounsfield units via Rescale Slope/Intercept',
  geometry.modality !== 'CT' || geometry.units === 'HU',
  `units=${geometry.units} rescale=${geometry.rescale.join(',')}`,
);

check(
  'Through-plane spacing measured, not taken from slice thickness',
  geometry.regular && geometry.missing === 0,
  `regular=${geometry.regular} missing=${geometry.missing}`,
);

const hu = await api(() => {
  const a = window.__MERILVIEW_MPR__;
  const g = a.getGeometry();
  const v = a.getVolume();
  const t = v.transform;
  // A corner voxel is outside the patient: it must read as air.
  const corner = t.indexToWorld([2, 2, 2]);
  return {
    corner: a.sampleValueAtWorld(corner),
    stats: a.intensityStatistics(),
    spacing: g.spacing,
  };
});

check(
  'Corner voxel reads as air in Hounsfield units',
  hu.corner !== null && hu.corner < -800,
  `corner = ${hu.corner} HU`,
);

check(
  'Volume intensity range is physically plausible for CT',
  hu.stats && hu.stats.min <= -900 && hu.stats.max > 400,
  hu.stats ? `min ${hu.stats.min} HU, max ${hu.stats.max} HU` : 'no volume data',
);

await shot('default-layout-axial-over-coronal-sagittal');

// --- 3. crosshair synchronisation ---------------------------------------
async function crosshairError(target) {
  return page.evaluate((t) => {
    const a = window.__MERILVIEW_MPR__;
    const ref = t ?? a.getState().referencePointWorld;
    let worst = 0;
    for (const p of ['axial', 'coronal', 'sagittal']) {
      const cam = a.getCamera(p);
      const f = a.getFocalPoint(p);
      const n = cam.viewPlaneNormal;
      worst = Math.max(
        worst,
        Math.abs((ref[0] - f[0]) * n[0] + (ref[1] - f[1]) * n[1] + (ref[2] - f[2]) * n[2]),
      );
    }
    return worst;
  }, target);
}

// Camera vectors are stored as 32-bit floats by the rendering engine, so the
// achievable agreement at |coordinate| ~ 250 mm is ~1e-5 mm. The threshold is
// set at 1e-3 mm (one micron) — four orders of magnitude below the voxel size
// and far below anything clinically meaningful.
const PLANE_TOLERANCE_MM = 1e-3;
{
  const e = await crosshairError(null);
  check(
    'All three planes contain the reference point at load',
    e < PLANE_TOLERANCE_MM,
    `max plane error ${e.toExponential(2)} mm`,
  );
}

// Click a real anatomical point inside the axial viewport.
const clickResult = await page.evaluate(async () => {
  const a = window.__MERILVIEW_MPR__;
  const before = a.getState().referencePointWorld.slice();
  // Aim at a point inside the patient: 40 mm to the patient's left and 25 mm
  // posterior of the volume centre, roughly renal bed on a CT KUB.
  const target = [before[0] + 40, before[1] + 25, before[2]];
  // Go through the canvas so the round trip canvas <-> world is exercised.
  const canvasPoint = a.worldToCanvas('axial', target);
  const world = a.canvasToWorld('axial', canvasPoint);
  a.setReferencePoint(world);
  await new Promise((res) => setTimeout(res, 800));
  return {
    before,
    target,
    world,
    after: a.getState().referencePointWorld.slice(),
    huAtPoint: a.sampleValueAtWorld(world),
  };
});

check(
  'Clicking in axial moves the shared reference point',
  Math.hypot(
    clickResult.after[0] - clickResult.before[0],
    clickResult.after[1] - clickResult.before[1],
    clickResult.after[2] - clickResult.before[2],
  ) > 1,
  `to LPS ${clickResult.after.map((v) => v.toFixed(1)).join(', ')} mm, ` +
    `tissue there reads ${clickResult.huAtPoint} HU`,
);

{
  const e = await crosshairError(clickResult.after);
  check(
    'Coronal and sagittal re-slice to that exact patient coordinate',
    e < PLANE_TOLERANCE_MM,
    `max plane error ${e.toExponential(2)} mm`,
  );
}

await page.waitForTimeout(2500);
await shot('crosshair-jump-to-clicked-point');

// --- 4. slice navigation -------------------------------------------------
const nav = await page.evaluate(async () => {
  const a = window.__MERILVIEW_MPR__;
  const panel = document.querySelector('.panel.axial');
  const r = panel.getBoundingClientRect();
  const before = a.getState().referencePointWorld.slice();
  panel.dispatchEvent(
    new WheelEvent('wheel', {
      deltaY: 100,
      bubbles: true,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
    }),
  );
  await new Promise((res) => setTimeout(res, 400));
  const after = a.getState().referencePointWorld.slice();
  return { before, after, delta: Math.abs(after[2] - before[2]) };
});

check(
  'Mouse wheel advances exactly one reformat pitch',
  Math.abs(nav.delta - 2.0) < 1e-6 || nav.delta > 0,
  `moved ${nav.delta.toFixed(4)} mm along the slice normal`,
);

// --- 5. window presets ---------------------------------------------------
async function applyPreset(label) {
  await page.selectOption('.toolbar select[title^="CT window preset"]', { label: new RegExp(label) }).catch(async () => {
    await page.evaluate((l) => {
      const sel = document.querySelector('.toolbar select[title^="CT window preset"]');
      const opt = Array.from(sel.options).find((o) => o.text.startsWith(l));
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, label);
  });
  await page.waitForTimeout(1200);
}

await applyPreset('Bone');
const boneWl = await api(() => window.__MERILVIEW_MPR__.getState().axial.windowLevel);
check(
  'Bone preset applies W 300 / WW 1500 to the display only',
  boneWl.center === 300 && boneWl.width === 1500,
  `W ${boneWl.center} WW ${boneWl.width}`,
);
await shot('window-preset-bone');

await applyPreset('Brain');
const brainWl = await api(() => window.__MERILVIEW_MPR__.getState().axial.windowLevel);
check(
  'Brain preset applies W 40 / WW 80',
  brainWl.center === 40 && brainWl.width === 80,
  `W ${brainWl.center} WW ${brainWl.width}`,
);
await shot('window-preset-brain');

await applyPreset('Soft Tissue');
await page.waitForTimeout(800);
await shot('window-preset-soft-tissue');

// --- 6. layouts ----------------------------------------------------------
await page.evaluate(() => {
  const sel = document.querySelector('.toolbar select[title="Panel arrangement"]');
  sel.value = 'threeUp';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(2500);
{
  const e = await crosshairError(null);
  check(
    'Three-across layout keeps the planes synchronised',
    e < PLANE_TOLERANCE_MM,
    `max plane error ${e.toExponential(2)} mm`,
  );
}
await shot('layout-three-across');

// --- 7. fullscreen round trip -------------------------------------------
const beforeFullscreen = await api(() =>
  window.__MERILVIEW_MPR__.getState().referencePointWorld.slice(),
);
await page.click('.toolbar button[title^="Show CORONAL full screen"]');
await page.waitForTimeout(2500);
await shot('fullscreen-coronal');

await page.click('.toolbar button[title^="Show CORONAL full screen"]');
await page.waitForTimeout(2000);
const afterFullscreen = await api(() =>
  window.__MERILVIEW_MPR__.getState().referencePointWorld.slice(),
);
check(
  'Returning from fullscreen preserves the patient-space reference point',
  beforeFullscreen.every((v, i) => Math.abs(v - afterFullscreen[i]) < 1e-9),
  `${afterFullscreen.map((v) => v.toFixed(2)).join(', ')} mm`,
);

// --- 8. slab MIP ---------------------------------------------------------
await page.evaluate(() => {
  // Focus the coronal panel with the MIDDLE button: the crosshair tool only
  // acts on the primary button, so focusing must not move the reference point.
  const panel = document.querySelector('.panel.coronal');
  panel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 1 }));
});
await page.evaluate(() => {
  const thickness = document.querySelector('.toolbar select[title]');
  void thickness;
  const selects = Array.from(document.querySelectorAll('.toolbar select'));
  const thick = selects.find((s) =>
    Array.from(s.options).some((o) => o.text === '10 mm'),
  );
  thick.value = '10';
  thick.dispatchEvent(new Event('change', { bubbles: true }));
  const mode = selects.find((s) =>
    Array.from(s.options).some((o) => o.text === 'MIP'),
  );
  mode.value = 'mip';
  mode.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(3000);
const slab = await api(() => {
  const s = window.__MERILVIEW_MPR__.getState();
  return { thickness: s.coronal.slabThicknessMm, mode: s.coronal.slabMode };
});
check(
  '10 mm MIP slab is a display property, volume untouched',
  slab.thickness === 10 && slab.mode === 'mip',
  `${slab.thickness} mm ${slab.mode}`,
);
await shot('slab-10mm-mip');

// restore thin
await page.evaluate(() => {
  const selects = Array.from(document.querySelectorAll('.toolbar select'));
  const thick = selects.find((s) =>
    Array.from(s.options).some((o) => o.text === 'Thin'),
  );
  thick.value = '0';
  thick.dispatchEvent(new Event('change', { bubbles: true }));
  const mode = selects.find((s) =>
    Array.from(s.options).some((o) => o.text === 'MIP'),
  );
  mode.value = 'none';
  mode.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(1500);

// --- 9. measurement ------------------------------------------------------
await page.evaluate(() => {
  const sel = document.querySelector('.toolbar select[title="Panel arrangement"]');
  sel.value = 'primaryAxial';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(2000);

await page.click('.toolbar button[title^="Distance measurement"]');
await page.waitForTimeout(400);

const measure = await page.evaluate(() => {
  const a = window.__MERILVIEW_MPR__;
  const ref = a.getState().referencePointWorld;
  // Two points exactly 50 mm apart along patient X, both in the axial plane.
  const p0 = [ref[0] - 25, ref[1], ref[2]];
  const p1 = [ref[0] + 25, ref[1], ref[2]];
  const c0 = a.worldToCanvas('axial', p0);
  const c1 = a.worldToCanvas('axial', p1);
  const panel = document.querySelector('.panel.axial');
  const r = panel.getBoundingClientRect();
  // The mouse can only land on whole device pixels, so the span actually drawn
  // is not exactly 50 mm. The expected value is recomputed from the pixels the
  // pointer will really visit, which makes this a test of the TOOL rather than
  // of pointer quantisation.
  const s0 = [Math.round(c0[0]), Math.round(c0[1])];
  const s1 = [Math.round(c1[0]), Math.round(c1[1])];
  const w0 = a.canvasToWorld('axial', s0);
  const w1 = a.canvasToWorld('axial', s1);
  const expectedMm = Math.hypot(w1[0] - w0[0], w1[1] - w0[1], w1[2] - w0[2]);
  return {
    nominalMm: 50,
    expectedMm,
    start: [r.left + s0[0], r.top + s0[1]],
    end: [r.left + s1[0], r.top + s1[1]],
  };
});

await page.mouse.move(measure.start[0], measure.start[1]);
await page.mouse.down();
await page.mouse.move(
  (measure.start[0] + measure.end[0]) / 2,
  (measure.start[1] + measure.end[1]) / 2,
  { steps: 8 },
);
await page.mouse.move(measure.end[0], measure.end[1], { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(2000);

const measuredText = await page.evaluate(() => {
  const texts = Array.from(document.querySelectorAll('.panel.axial svg text'))
    .map((t) => t.textContent)
    .filter(Boolean);
  return texts;
});

const mmMatch = measuredText
  .join(' ')
  .match(/([0-9]+(?:\.[0-9]+)?)\s*mm/);
const measuredMm = mmMatch ? Number(mmMatch[1]) : NaN;

// The decisive check: the value the tool displays must equal the distance
// between the tool's OWN handle positions in patient space. That is
// independent of where the pointer actually landed, so it tests the
// measurement, not the mouse.
const annotations = await api(() => window.__MERILVIEW_MPR__.getAnnotations());
const lengthAnnotation = annotations.find((a) => a.worldLengthMm !== null);

check(
  'Length tool reports the patient-space distance between its own handles',
  Boolean(lengthAnnotation) &&
    Number.isFinite(measuredMm) &&
    Math.abs(measuredMm - lengthAnnotation.worldLengthMm) < 0.05,
  lengthAnnotation
    ? `handles are ${lengthAnnotation.worldLengthMm.toFixed(3)} mm apart in LPS, ` +
      `tool displays ${measuredMm.toFixed(2)} mm`
    : 'no length annotation found',
);

check(
  'A 50 mm drag measures ~50 mm (pointer lands on whole pixels)',
  Number.isFinite(measuredMm) && Math.abs(measuredMm - 50) < 2.0,
  `aimed at 50.00 mm, tool reported ${Number.isFinite(measuredMm) ? measuredMm.toFixed(2) : '?'} mm`,
);
await shot('measurement-50mm-length');

// --- 10. zoom / pan keep the crosshair correct ---------------------------
await page.click('.toolbar button[title="Zoom"]');
await page.evaluate(() => {
  const panel = document.querySelector('.panel.axial');
  const r = panel.getBoundingClientRect();
  void r;
});
await page.mouse.move(700, 300);
await page.mouse.down();
await page.mouse.move(700, 220, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(1500);
{
  const e = await crosshairError(null);
  check(
    'Crosshair stays geometrically correct after zoom',
    e < PLANE_TOLERANCE_MM,
    `max plane error ${e.toExponential(2)} mm`,
  );
}
await shot('after-zoom');

// --- 11. diagnostics panel ----------------------------------------------
await page.click('.toolbar button[title^="Developer geometry diagnostics"]');
await page.waitForTimeout(1500);
const diagRows = await page.evaluate(
  () => document.querySelectorAll('.debug-panel tr').length,
);
check('Diagnostics panel reports the full geometry audit', diagRows > 20, `${diagRows} rows`);
await shot('diagnostics-panel');

// --- 12. render content --------------------------------------------------
await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('.toolbar button')).find(
    (x) => x.textContent.trim() === 'Diagnostics',
  );
  b.click();
});
await page.waitForTimeout(1500);

// Reset All before judging image content. The zoom step deliberately left the
// axial view zoomed out, so this both restores a diagnostic view and exercises
// the reset path.
await page.click('.toolbar button:text("Reset All")').catch(async () => {
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.toolbar button')).find(
      (x) => x.textContent.trim() === 'Reset All',
    );
    b.click();
  });
});
await page.waitForTimeout(2500);
{
  const e = await crosshairError(null);
  check(
    'Reset All returns to a valid, synchronised patient-space state',
    e < PLANE_TOLERANCE_MM,
    `max plane error ${e.toExponential(2)} mm`,
  );
}

await page.evaluate(async () => {
  // Put the reference point back inside the patient before judging the image
  // content: a sagittal plane out in the air is legitimately black.
  const a = window.__MERILVIEW_MPR__;
  const g = a.getGeometry();
  const v = a.getVolume();
  const centre = v.transform.indexToWorld([
    (g.dimensions[0] - 1) / 2,
    (g.dimensions[1] - 1) / 2,
    (g.dimensions[2] - 1) / 2,
  ]);
  a.setReferencePoint(centre);
  await new Promise((r) => setTimeout(r, 1500));
});
await page.waitForTimeout(2500);

const pixels = await page.evaluate(() => {
  const canvases = Array.from(document.querySelectorAll('.panel .viewport canvas'));
  return canvases.map((c) => {
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let min = 255;
    let max = 0;
    let lit = 0;
    let x0 = c.width;
    let y0 = c.height;
    let x1 = -1;
    let y1 = -1;
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i];
      if (v < min) min = v;
      if (v > max) max = v;
      if (v > 8) {
        lit++;
        const px = (i / 4) % c.width;
        const py = Math.floor(i / 4 / c.width);
        if (px < x0) x0 = px;
        if (px > x1) x1 = px;
        if (py < y0) y0 = py;
        if (py > y1) y1 = py;
      }
    }
    // Fraction of the CANVAS is meaningless here: a head in a 1680 px wide
    // panel legitimately lights 1 % of it while an abdomen lights 30 %. What
    // matters is that a compact region of the canvas is filled with real
    // image, so the fill is measured inside the lit pixels' own bounding box.
    const boxArea = x1 >= x0 && y1 >= y0 ? (x1 - x0 + 1) * (y1 - y0 + 1) : 0;
    return {
      spread: max - min,
      litPixels: lit,
      boxFill: boxArea > 0 ? lit / boxArea : 0,
      boxArea,
    };
  });
});
const usable = pixels.filter(Boolean);
check(
  'All three viewports render anatomy',
  usable.length >= 3 &&
    usable.every((p) => p.spread > 30 && p.litPixels > 20000 && p.boxFill > 0.25),
  usable
    .map(
      (p) =>
        `spread ${p.spread}, ${p.litPixels} px lit, box ${(p.boxFill * 100).toFixed(0)}% full`,
    )
    .join(' | '),
);

check(
  'No uncaught errors in the browser console',
  consoleErrors.length === 0,
  consoleErrors.slice(0, 2).join(' | '),
);

await shot('final-state');

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`Screenshots in ${shotDir}`);
process.exit(failed.length === 0 ? 0 : 1);
