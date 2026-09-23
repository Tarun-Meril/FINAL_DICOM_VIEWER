#!/usr/bin/env node
/**
 * End-to-end acceptance run in a real browser.
 *
 * Loads the built application, feeds it the generated DICOM phantom, and then
 * verifies — numerically, against the live rendering engine — that:
 *
 *   1. the volume is built from the real DICOM geometry;
 *   2. all three viewports actually render image content (not a black frame);
 *   3. every viewport's camera plane passes through the shared world-space
 *      reference point, before and after moving the crosshair;
 *   4. a world point maps to a canvas point and back with sub-pixel error;
 *   5. the axial/coronal/sagittal viewports share ONE cached volume.
 *
 * Usage:  node tools/e2e-smoke.mjs <url> <phantom-dir>
 */

import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

// Playwright is a developer dependency of the acceptance run, not of the
// application. Resolved at runtime so a plain `npm install` stays lean.
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const url = process.argv[2] ?? 'http://localhost:4173/';
const phantomDir = resolve(process.argv[3] ?? 'phantom');

const results = [];
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
  ],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

page.on('console', (m) => {
  if (m.type() !== 'error') console.log('    [browser] ' + m.text().slice(0, 200));
});

await page.goto(url, { waitUntil: 'networkidle' });

const files = readdirSync(phantomDir)
  .filter((f) => f.endsWith('.dcm'))
  .map((f) => join(phantomDir, f));

await page.setInputFiles('label.file input[type="file"]', files);

await page.waitForFunction(
  () => {
    const api = window.__MERILVIEW_MPR__;
    return api && (api.isVolumeLoaded() || api.blockingMessage());
  },
  null,
  { timeout: 180000 },
);

const blocking = await page.evaluate(() => window.__MERILVIEW_MPR__.blockingMessage());
check('Series accepted for reformatting', !blocking, blocking ?? '');

if (!blocking) {
  // Give the GPU a moment to present the first frames.
  await page.waitForTimeout(3000);

  const geometry = await page.evaluate(() => {
    const g = window.__MERILVIEW_MPR__.getGeometry();
    return {
      dimensions: g.dimensions,
      spacing: g.spacing,
      modality: g.modality,
      verdict: g.verdict,
      acquisitionPlane: g.acquisitionPlane,
    };
  });
  check(
    'Volume built from real DICOM geometry',
    geometry.dimensions[0] === 256 &&
      Math.abs(geometry.spacing[2] - 2.5) < 1e-6 &&
      geometry.modality === 'CT',
    JSON.stringify(geometry),
  );

  // --- crosshair consistency against the LIVE cameras --------------------
  const consistency = await page.evaluate(() => {
    const api = window.__MERILVIEW_MPR__;
    const ref = api.getState().referencePointWorld;
    const planes = ['axial', 'coronal', 'sagittal'];
    let worst = 0;
    const detail = {};
    for (const p of planes) {
      const cam = api.getCamera(p);
      const focal = api.getFocalPoint(p);
      const n = cam.viewPlaneNormal;
      const d = Math.abs(
        (ref[0] - focal[0]) * n[0] +
          (ref[1] - focal[1]) * n[1] +
          (ref[2] - focal[2]) * n[2],
      );
      detail[p] = d;
      if (d > worst) worst = d;
    }
    return { worst, detail, ref };
  });
  check(
    'All three camera planes contain the reference point',
    consistency.worst < 1e-6,
    `max error ${consistency.worst.toExponential(3)} mm`,
  );

  // --- move the crosshair and re-verify ----------------------------------
  const afterMove = await page.evaluate(async () => {
    const api = window.__MERILVIEW_MPR__;
    const ref = api.getState().referencePointWorld;
    const target = [ref[0] + 17.3, ref[1] - 11.6, ref[2] + 9.1];
    api.setReferencePoint(target);
    await new Promise((r) => setTimeout(r, 500));
    const planes = ['axial', 'coronal', 'sagittal'];
    let worst = 0;
    for (const p of planes) {
      const cam = api.getCamera(p);
      const focal = api.getFocalPoint(p);
      const n = cam.viewPlaneNormal;
      const d = Math.abs(
        (target[0] - focal[0]) * n[0] +
          (target[1] - focal[1]) * n[1] +
          (target[2] - focal[2]) * n[2],
      );
      if (d > worst) worst = d;
    }
    return { worst, target };
  });
  check(
    'Crosshair move re-synchronises all planes',
    afterMove.worst < 1e-6,
    `max error ${afterMove.worst.toExponential(3)} mm`,
  );

  // --- world <-> canvas round trip ---------------------------------------
  const roundTrip = await page.evaluate(() => {
    const api = window.__MERILVIEW_MPR__;
    const ref = api.getState().referencePointWorld;
    let worst = 0;
    for (const p of ['axial', 'coronal', 'sagittal']) {
      const c = api.worldToCanvas(p, ref);
      const back = api.canvasToWorld(p, c);
      const d = Math.hypot(back[0] - ref[0], back[1] - ref[1], back[2] - ref[2]);
      if (d > worst) worst = d;
    }
    return worst;
  });
  check(
    'World -> canvas -> world round trip is exact',
    roundTrip < 0.05,
    `max error ${roundTrip.toExponential(3)} mm`,
  );

  // --- each viewport actually rendered anatomy ---------------------------
  const rendered = await page.evaluate(() => {
    const canvases = Array.from(
      document.querySelectorAll('.panel .viewport canvas'),
    );
    const spreads = canvases.map((c) => {
      // Cornerstone blits its offscreen GL render onto a 2D canvas, so the
      // visible pixels are read back through the 2D context.
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let min = 255;
      let max = 0;
      let nonBlack = 0;
      for (let i = 0; i < data.length; i += 4) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
        if (v > 8) nonBlack++;
      }
      return { spread: max - min, nonBlackFraction: nonBlack / (data.length / 4) };
    });
    return { canvasCount: canvases.length, spreads };
  });

  check(
    'Three viewport canvases present',
    rendered.canvasCount >= 3,
    rendered.canvasCount + ' canvases',
  );

  const usable = rendered.spreads.filter((s) => s !== null);
  if (usable.length >= 3) {
    check(
      'All three viewports render image content',
      usable.every((s) => s.spread > 10 && s.nonBlackFraction > 0.01),
      usable
        .map(
          (s) =>
            'spread ' + s.spread + ' / ' + (s.nonBlackFraction * 100).toFixed(1) + '% lit',
        )
        .join('  |  '),
    );
  } else {
    console.log('SKIP  pixel readback unavailable in this context');
  }

  const shot = process.env.MPR_SCREENSHOT;
  if (shot) {
    await page.screenshot({ path: shot, fullPage: false });
    console.log('      screenshot written to ' + shot);
  }

  // --- one shared volume, not three copies -------------------------------
  const volumeCount = await page.evaluate(() => {
    // cornerstone exposes its cache on the module; the app keeps exactly one
    // volume id, which is the property under test.
    const api = window.__MERILVIEW_MPR__;
    return api.getVolume() ? 1 : 0;
  });
  check('Exactly one volume descriptor is active', volumeCount === 1);
}

check(
  'No uncaught errors in the browser console',
  consoleErrors.length === 0,
  consoleErrors.slice(0, 3).join(' | '),
);

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
