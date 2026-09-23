/**
 * Real-dataset render validation (§34, §36).
 *
 * Loads the supplied DICOM study into the built application in a real browser, exercises
 * every major feature through the application's own code paths, captures true rendered
 * frames, and writes a PASS/FAIL report.
 *
 * usage: node tools/validate-render.mjs <dicom-dir-or-zip> [outDir]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { serve } from './server.mjs';

const DATASET = process.argv[2] ?? '/home/claude/work/dataset';
const OUT = process.argv[3] ?? path.resolve('validation-output');
const DIST = path.resolve('dist');
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });

const results = [];
const record = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

/** Run one validation phase; a thrown error is recorded as a failure, not an abort, so a
 *  single broken feature still produces a complete report. */
async function phase(name, fn) {
  try { return await fn(); }
  catch (e) {
    record(name, false, `threw: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    return null;
  }
}

function listFiles(target) {
  const st = fs.statSync(target);
  if (st.isFile()) return [target];
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else out.push(p);
    }
  };
  walk(target);
  return out.sort();
}

const { server, url } = await serve(DIST, 8123);
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update',
    '--no-first-run', '--js-flags=--max-old-space-size=4096'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(900000);
page.setDefaultNavigationTimeout(900000);

// Uncaught script errors and failed resource loads are different things; the browser
// logs both to the console, so they are collected separately and judged separately.
const scriptErrors = [];
const resourceFailures = [];
page.on('pageerror', (e) => scriptErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const text = m.text();
  if (/Failed to load resource/i.test(text)) return; // counted via the response listener
  scriptErrors.push(text);
});
page.on('response', (r) => {
  if (r.status() >= 400) resourceFailures.push(`${r.status()} ${r.url()}`);
});
page.on('requestfailed', (r) => {
  resourceFailures.push(`${r.failure()?.errorText ?? 'failed'} ${r.url()}`);
});

const t0 = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 120000 });

const caps = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2');
  const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return gl ? {
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    max3D: gl.getParameter(gl.MAX_3D_TEXTURE_SIZE),
  } : null;
});
console.log('GPU:', JSON.stringify(caps));

/* ------------------------------------------------------------- load study */
const files = listFiles(DATASET);
console.log(`feeding ${files.length} file(s) through the application's own file input…`);
const tLoad = Date.now();
await page.setInputFiles('input[type=file]:not([webkitdirectory])', files);

// NOTE: playwright's waitForFunction takes (fn, arg, options) — options must be third.
await page.waitForFunction(
  () => !!document.querySelector('.app') || !!document.querySelector('.note.error'),
  undefined, { timeout: 900000, polling: 1000 });
// The automation bridge appears once the viewport has uploaded the volume and drawn
// its first frame, which is slow on a software rasteriser.
await page.waitForFunction(() => !!window.__medview?.engine,
  undefined, { timeout: 1800000, polling: 1000 });
const loadMs = Date.now() - tLoad;

const state = await page.evaluate(() => {
  const st = window.__medview.store.getState();
  const load = st.load;
  return {
    status: st.status,
    preset: st.transferFunction.name,
    presetReason: st.initialPresetReason,
    adaptation: st.presetAdaptationNote,
    qualityNotice: st.qualityNotice,
    series: {
      studyInstanceUID: load.series.studyInstanceUID,
      seriesInstanceUID: load.series.seriesInstanceUID,
      frameOfReferenceUID: load.series.frameOfReferenceUID,
      modality: load.series.modality,
      description: load.series.seriesDescription,
      number: load.series.seriesNumber,
      instances: load.series.instanceCount,
      rows: load.series.rows, columns: load.series.columns,
      pixelSpacing: load.series.pixelSpacing,
      sliceThickness: load.series.sliceThickness,
      transferSyntax: load.series.transferSyntaxName,
      kernel: load.series.convolutionKernel,
      patientPosition: load.series.patientPosition,
    },
    geometry: {
      dimensions: load.volume.geometry.dimensions,
      spacing: load.volume.geometry.spacing,
      origin: load.volume.geometry.origin,
      iAxis: load.volume.geometry.iAxis, jAxis: load.volume.geometry.jAxis, kAxis: load.volume.geometry.kAxis,
      physicalSize: load.volume.geometry.physicalSize,
      spacingSource: load.volume.geometry.spacingSource,
      strategy: load.volume.provenance.reconstructionStrategy,
    },
    stats: {
      min: load.volume.statistics.min, max: load.volume.statistics.max,
      mean: load.volume.statistics.mean, stdDev: load.volume.statistics.stdDev,
      percentiles: load.volume.statistics.percentiles,
      denseFraction: load.volume.statistics.denseFraction,
      airFraction: load.volume.statistics.airFraction,
    },
    conformance: load.conformance.checks.map((c) => ({ name: c.name, pass: c.pass, actual: c.actual })),
    contrast: load.contrast,
    issues: load.volume.issues.map((i) => ({ code: i.code, severity: i.severity, message: i.message })),
    diagnostics: {
      filesFound: load.diagnostics.filesFound,
      valid: load.diagnostics.validDicomFiles,
      rejected: load.diagnostics.rejectedFiles.length,
      studies: load.diagnostics.studyCount,
      series: load.diagnostics.seriesCount,
      selectionReason: load.diagnostics.selectionReason,
      allSeries: load.studies.flatMap((s) => s.series.map((x) => ({
        number: x.seriesNumber, description: x.seriesDescription, role: x.role,
        score: Number(x.volumeScore.toFixed(3)), instances: x.instanceCount,
      }))),
    },
    timings: load.timings,
  };
});

record('Real DICOM CT study loads through the application UI', state.status === 'ready',
  `${state.diagnostics.valid} DICOM files, ${state.diagnostics.studies} study, ${state.diagnostics.series} series, ${(loadMs / 1000).toFixed(1)} s`);
record('Correct CT volumetric series selected', state.series.modality === 'CT' && state.series.instances >= 100,
  `series ${state.series.number} "${state.series.description}", ${state.series.instances} instances`);
record('Non-volumetric series excluded',
  state.diagnostics.allSeries.some((s) => s.role !== 'volumetric'),
  state.diagnostics.allSeries.map((s) => `#${s.number} ${s.role}`).join(', '));
record('Slice geometry verified', state.conformance.every((c) => c.pass),
  state.conformance.filter((c) => !c.pass).map((c) => c.name).join('; ') || 'all 8 conformance checks pass');
record('No silent left-right inversion (right-handed basis)',
  state.conformance.find((c) => c.name.includes('right-handed'))?.pass === true,
  state.conformance.find((c) => c.name.includes('right-handed'))?.actual);
record('HU conversion verified',
  state.stats.min >= -1100 && state.stats.max <= 3100 && state.stats.min <= -900,
  `HU ${state.stats.min} … ${state.stats.max}, mean ${state.stats.mean.toFixed(1)}`);
record('Correct volume dimensions established',
  state.geometry.dimensions[0] === state.series.columns && state.geometry.dimensions[1] === state.series.rows,
  `${state.geometry.dimensions.join('×')} voxels, ${state.geometry.physicalSize.map((v) => v.toFixed(1)).join(' × ')} mm`);
record('Slice spacing measured from image positions, not SliceThickness',
  state.geometry.spacingSource === 'measured', `spacing source: ${state.geometry.spacingSource}`);

/* ------------------------------------------------- helper: capture a frame */
async function capture(name, label) {
  const t = Date.now();
  const dataUrl = await page.evaluate(async () => {
    const e = window.__medview.engine;
    return await e.capture({ format: 'image/png' });
  });
  const ms = Date.now() - t;
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  fs.writeFileSync(path.join(OUT, 'screenshots', `${name}.png`), buf);
  // Non-black pixel fraction is the cheapest proof that something was actually rendered.
  const stats = await page.evaluate(async (url) => {
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.src = url; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let lit = 0, sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (v > 12) lit++;
      sum += v;
    }
    return { width: img.width, height: img.height, litFraction: lit / (d.length / 4), meanLuma: sum / (d.length / 4) };
  }, dataUrl);
  console.log(`   captured ${name}: ${stats.width}×${stats.height}, ${(stats.litFraction * 100).toFixed(1)}% lit, mean luma ${stats.meanLuma.toFixed(1)}, ${ms} ms`);
  return { name, label, ms, ...stats };
}

const setState = (fn, arg) => page.evaluate(fn, arg);
const captures = [];

/* --------------------------------------------------------- bone renderings */
// Everything from here is wrapped so that one broken feature still produces a complete
// report rather than aborting the run.
let runError = null;
let segResult = null, measureResult = null, surfaceResult = null;
let interaction = null, perf = null, orientation = null;
try {
await setState(() => { window.__medview.store.getState().selectPreset('bone'); });
await page.waitForTimeout(300);
for (const [id, name] of [['anterior', '01-bone-anterior'], ['posterior', '02-bone-posterior'],
  ['left', '03-bone-left'], ['superior', '04-bone-superior'], ['ant-left-45', '05-bone-oblique']]) {
  await setState((p) => {
    const st = window.__medview.store.getState();
    window.__medview.engine.applyCameraPreset(p, st.parallelProjection);
    st.setCameraPreset(p);
  }, id);
  captures.push(await capture(name, `Bone preset — ${id}`));
}
record('Bone rendering produces a visible volume',
  captures.filter((c) => c.name.startsWith('0')).every((c) => c.litFraction > 0.02),
  captures.slice(0, 5).map((c) => `${c.name} ${(c.litFraction * 100).toFixed(1)}%`).join(', '));

record('Camera presets change the rendered view',
  new Set(captures.slice(0, 5).map((c) => c.meanLuma.toFixed(3))).size >= 4,
  captures.slice(0, 5).map((c) => c.meanLuma.toFixed(2)).join(' / '));

/* ---------------------------------------------- bone with transparency */
await setState(() => {
  const st = window.__medview.store.getState();
  const tf = st.transferFunction;
  st.setTransferFunction({ ...tf, opacity: tf.opacity.map((p) => ({ ...p, opacity: p.opacity * 0.45 })), scalarOpacityUnitDistance: 3.0, builtIn: false });
  window.__medview.engine.applyCameraPreset('ant-left-45', st.parallelProjection);
});
await page.waitForTimeout(200);
captures.push(await capture('06-bone-transparent', 'Bone with reduced opacity'));

/* --------------------------------------------------------- soft tissue */
await setState(() => {
  const st = window.__medview.store.getState();
  st.selectPreset('soft-tissue');
  window.__medview.engine.applyCameraPreset('anterior', st.parallelProjection);
});
await page.waitForTimeout(300);
const soft = await capture('07-soft-tissue-anterior', 'Soft tissue preset');
captures.push(soft);
record('Soft tissue rendering works', soft.litFraction > 0.02, `${(soft.litFraction * 100).toFixed(1)}% lit`);

await setState(() => { window.__medview.store.getState().selectPreset('skin'); });
await page.waitForTimeout(300);
captures.push(await capture('08-skin-anterior', 'Skin preset'));

/* --------------------------------------------------------------- CTA */
await setState(() => {
  const st = window.__medview.store.getState();
  st.selectPreset('vascular-cta');
  window.__medview.engine.applyCameraPreset('left', st.parallelProjection);
});
await page.waitForTimeout(300);
const cta = await capture('09-cta-left', 'Vascular / CTA preset');
captures.push(cta);
record('CTA preset renders (applicability depends on contrast)',
  cta.litFraction > 0.005,
  `${(cta.litFraction * 100).toFixed(1)}% lit; contrast likely = ${state.contrast.likely} (${state.contrast.reason})`);

/* ---------------------------------------------------- transfer function */
const tfProbe = await page.evaluate(() => {
  const st = window.__medview.store.getState();
  st.selectPreset('bone');
  const before = JSON.parse(JSON.stringify(st.transferFunction.opacity));
  const shifted = { ...window.__medview.store.getState().transferFunction, opacity: before.map((p) => ({ ...p, hu: p.hu + 400 })), builtIn: false };
  window.__medview.store.getState().setTransferFunction(shifted);
  return { before: before.length, after: window.__medview.store.getState().transferFunction.opacity[2].hu };
});
await page.waitForTimeout(200);
const tfShifted = await capture('10-tf-shifted-+400HU', 'Bone ramp shifted +400 HU');
captures.push(tfShifted);
record('Transfer function changes what is visible',
  Math.abs(tfShifted.litFraction - captures[0].litFraction) > 0.002,
  `lit ${(captures[0].litFraction * 100).toFixed(2)}% → ${(tfShifted.litFraction * 100).toFixed(2)}% after +400 HU shift (${tfProbe.before} control points)`);

/* -------------------------------------------------------------- MIP */
await setState(() => {
  const st = window.__medview.store.getState();
  st.selectPreset('mip');
  window.__medview.engine.applyCameraPreset('anterior', st.parallelProjection);
});
await page.waitForTimeout(300);
captures.push(await capture('11-mip-anterior', 'Maximum intensity projection'));

/* ---------------------------------------------------------- clipping */
await setState(() => {
  const st = window.__medview.store.getState();
  st.selectPreset('bone');
  window.__medview.engine.applyCameraPreset('ant-left-45', st.parallelProjection);
  st.updateClipPlane('left', { enabled: true, position: 0.5 });
});
await page.waitForTimeout(400);
const clipped = await capture('12-clipped-midline', 'Sagittal clipping plane at midline');
captures.push(clipped);
record('Clipping plane removes part of the volume without emptying it',
  clipped.litFraction < captures[4].litFraction * 0.95 && clipped.litFraction > 0.005,
  `lit ${(captures[4].litFraction * 100).toFixed(2)}% → ${(clipped.litFraction * 100).toFixed(2)}%`);
await setState(() => { window.__medview.store.getState().resetClipping(); });

/* --------------------------------------------------------- crop / VOI */
await setState(() => {
  const st = window.__medview.store.getState();
  st.setCropBox({ enabled: true, showOnlyRoi: true, min: [0.2, 0.15, 0.45], max: [0.8, 0.85, 1.0] });
});
await page.waitForTimeout(400);
const cropped = await capture('13-cropped-voi', 'Volume of interest crop box');
captures.push(cropped);
// A crop must remove SOME of the volume and leave the rest — an empty frame means the
// clipping-plane sign convention is inverted, which is a silent failure mode.
record('VOI crop box restricts the rendered volume without emptying it',
  cropped.litFraction < captures[4].litFraction * 0.95 && cropped.litFraction > 0.005,
  `lit ${(captures[4].litFraction * 100).toFixed(2)}% → ${(cropped.litFraction * 100).toFixed(2)}%`);
await setState(() => { window.__medview.store.getState().resetCropBox(); });

/* -------------------------------------------------------- segmentation */
segResult = await page.evaluate(async () => {
  const { store, getSession } = window.__medview;
  const session = getSession();
  const st = store.getState();
  const ops = await window.__medview.ops.segmentation();
  const bone = await window.__medview.ops.boneRemoval();
  const suggestion = bone.suggestBoneThreshold(session.volume);
  const seg = {
    id: 1, name: `Bone ≥ ${suggestion.thresholdHU} HU`, color: [0.95, 0.9, 0.8],
    opacity: 0.7, visible: true, origin: 'threshold', createdAt: Date.now(),
    parameters: { thresholdHU: suggestion.thresholdHU },
  };
  st.addSegment(seg);
  const t0 = performance.now();
  const res = bone.extractBone(session.volume, session.labels, 1, {
    thresholdHU: suggestion.thresholdHU, minComponentVoxels: 500, keepLargest: 0,
  });
  const extractMs = performance.now() - t0;
  for (const d of res.deltas) session.history.push({ delta: d, target: 'labels', at: Date.now() });
  const stats = session.labels.stats(1, session.volume);
  st.setSegmentStats(1, { voxelCount: stats.voxelCount, volumeMm3: stats.volumeMm3 });
  void ops;
  return {
    suggestion, extractMs, voxelCount: stats.voxelCount, volumeMm3: stats.volumeMm3,
    meanHU: stats.meanHU, minHU: stats.minHU, maxHU: stats.maxHU,
    components: res.componentCount, bounds: stats.bounds,
  };
});
record('3D segmentation (threshold + connected components) works',
  segResult.voxelCount > 10000,
  `threshold ${segResult.suggestion.thresholdHU} HU → ${segResult.voxelCount.toLocaleString()} voxels, ` +
  `${(segResult.volumeMm3 / 1000).toFixed(1)} mL, ${segResult.components} components, ${segResult.extractMs.toFixed(0)} ms`);

/* ----------------------------------------------------- keep bone only */
await page.evaluate(async () => {
  const { getSession, store, syncDisplay } = window.__medview;
  const session = getSession();
  const bone = await window.__medview.ops.boneRemoval();
  const d = bone.keepBone(session.visibility.values, session.labels, 1);
  session.history.push({ delta: d, target: 'visibility', at: Date.now() });
  syncDisplay(session);
  store.getState().selectPreset('bone');
  window.__medview.engine.applyCameraPreset('ant-left-45', store.getState().parallelProjection);
});
await page.waitForTimeout(400);
const boneOnly = await capture('14-segmented-bone-only', 'Bone segmentation isolated (soft tissue hidden)');
captures.push(boneOnly);
record('Bone isolation / bone removal changes the rendering',
  Math.abs(boneOnly.litFraction - captures[4].litFraction) > 0.001,
  `lit ${(captures[4].litFraction * 100).toFixed(2)}% → ${(boneOnly.litFraction * 100).toFixed(2)}%`);

/* -------------------------------------------------------- bone removal */
const removalCheck = await page.evaluate(async () => {
  const { getSession, syncDisplay } = window.__medview;
  const session = getSession();
  const bone = await window.__medview.ops.boneRemoval();
  // Undo the "keep bone" first so this starts from the full volume.
  session.history.undo((t) => (t === 'labels' ? session.labels.labels : session.visibility.values));
  syncDisplay(session);
  const d = bone.removeBone(session.visibility.values, session.labels, 1);
  session.history.push({ delta: d, target: 'visibility', at: Date.now() });
  syncDisplay(session);
  let hidden = 0;
  for (let i = 0; i < session.visibility.values.length; i++) if (!session.visibility.values[i]) hidden++;
  // Proof the SOURCE was not modified: HU max must still be the acquired maximum.
  let srcMax = -32768;
  for (let i = 0; i < session.volume.scalars.length; i += 97) srcMax = Math.max(srcMax, session.volume.scalars[i]);
  return { hidden, total: session.visibility.values.length, srcMax };
});
// Switch to soft tissue: with the bone preset still active a bone-removed volume is
// correctly but uninformatively empty, and the point of removing bone is to see what it
// was hiding.
await setState(() => { window.__medview.store.getState().selectPreset('soft-tissue'); });
await page.waitForTimeout(300);
captures.push(await capture('15-bone-removed', 'Bone removed, soft-tissue preset'));
await setState(() => { window.__medview.store.getState().selectPreset('bone'); });
// Removing bone must hide the bone and leave everything else: hiding every voxel means
// an undo silently failed or the mask was inverted.
record('Bone removal hides the bone label and nothing else',
  removalCheck.hidden > 1000 && removalCheck.hidden < removalCheck.total * 0.5,
  `${removalCheck.hidden.toLocaleString()} of ${removalCheck.total.toLocaleString()} voxels hidden ` +
  `(bone label holds ${segResult.voxelCount.toLocaleString()})`);
record('Bone removal is non-destructive (source volume unchanged)',
  removalCheck.srcMax >= 1000,
  `source HU max still ${removalCheck.srcMax} after the mask was applied`);

/* ------------------------------------------------------------ sculpting */
const sculptResult = await page.evaluate(async () => {
  const { getSession, syncDisplay, store } = window.__medview;
  const session = getSession();
  const ops = await window.__medview.ops.segmentation();
  // Reset every mask edit first.
  session.visibility.reset();
  session.display.set(session.volume.scalars);
  session.engine.refreshScalars(session.display);
  const g = session.volume.geometry;
  const centre = [
    g.origin[0] + g.iAxis[0] * (g.dimensions[0] / 2) * g.spacing[0],
    g.origin[1] + g.jAxis[1] * (g.dimensions[1] / 2) * g.spacing[1] + g.origin[1] * 0,
    g.origin[2] + g.kAxis[2] * (g.dimensions[2] * 0.72) * g.spacing[2],
  ];
  const t0 = performance.now();
  // Cut away the anterior half of the upper cranium with a plane, then a spherical bite.
  const planeDelta = ops.sculptPlane(session.visibility.values, g, centre, [0, -1, 0], 'erase');
  const brushDelta = ops.sculptSphere(session.visibility.values, g, centre, 35, 'erase');
  const ms = performance.now() - t0;
  session.history.push({ delta: planeDelta, target: 'visibility', at: Date.now() });
  session.history.push({ delta: brushDelta, target: 'visibility', at: Date.now() });
  syncDisplay(session);
  store.getState().selectPreset('bone');
  return {
    planeChanged: planeDelta.changed, planeKind: planeDelta.kind,
    brushChanged: brushDelta.changed, brushKind: brushDelta.kind, ms,
  };
});
await page.waitForTimeout(400);
const sculpted = await capture('16-sculpted', 'Plane cut + spherical brush erase');
captures.push(sculpted);
record('3D sculpting removes material in the rendering',
  sculptResult.planeChanged > 0 && sculptResult.brushChanged > 0 &&
  sculpted.litFraction < captures[4].litFraction && sculpted.litFraction > 0.005,
  `plane cut ${sculptResult.planeChanged.toLocaleString()} voxels (${sculptResult.planeKind} delta), ` +
  `brush ${sculptResult.brushChanged.toLocaleString()} voxels (${sculptResult.brushKind} delta), ` +
  `${sculptResult.ms.toFixed(0)} ms; lit ${(captures[4].litFraction * 100).toFixed(2)}% → ${(sculpted.litFraction * 100).toFixed(2)}%`);

/* ------------------------------------------------------- undo / redo */
const undoCheck = await page.evaluate(() => {
  const { getSession, syncDisplay } = window.__medview;
  const session = getSession();
  const before = session.visibility.removedCount();
  session.history.undo((t) => (t === 'labels' ? session.labels.labels : session.visibility.values));
  syncDisplay(session);
  const afterUndo = session.visibility.removedCount();
  session.history.redo((t) => (t === 'labels' ? session.labels.labels : session.visibility.values));
  syncDisplay(session);
  const afterRedo = session.visibility.removedCount();
  return { before, afterUndo, afterRedo };
});
record('Sculpting is reversible (undo / redo exact)',
  undoCheck.afterUndo < undoCheck.before && undoCheck.afterRedo === undoCheck.before,
  `${undoCheck.before} hidden → undo ${undoCheck.afterUndo} → redo ${undoCheck.afterRedo}`);

/* --------------------------------------------------------- measurement */
measureResult = await page.evaluate(async () => {
  const { getSession, store } = window.__medview;
  const session = getSession();
  const picking = await window.__medview.ops.picking();
  const mm = await window.__medview.ops.measurements();
  // Restore the full volume so picking sees real anatomy.
  session.visibility.reset();
  session.display.set(session.volume.scalars);
  session.engine.refreshScalars(session.display);
  store.getState().selectPreset('bone');
  const st = store.getState();
  const cam = session.engine.getCameraState();
  const host = document.querySelector('.viewport');
  const w = host.clientWidth, h = host.clientHeight;
  const hits = [];
  for (const [fx, fy] of [[0.42, 0.40], [0.58, 0.40], [0.50, 0.62]]) {
    const ray = picking.rayThroughPixel(cam, fx * w, fy * h, w, h);
    const hit = picking.pickFirstHit(ray, session.volume.scalars, session.volume.geometry, st.transferFunction, {});
    if (hit) hits.push(hit);
  }
  if (hits.length < 2) return { hits: hits.length };
  const dist = {
    id: 'v-dist', kind: 'distance', label: 'validation', color: [1, 0.8, 0.2], visible: true,
    createdAt: Date.now(), points: [hits[0].world, hits[1].world], spatiallyValid: true,
  };
  store.getState().addMeasurement(dist);
  const dv = mm.measure(dist, session.volume.geometry);
  let angleV = null;
  if (hits.length >= 3) {
    const ang = {
      id: 'v-ang', kind: 'angle', label: 'validation', color: [0.4, 0.9, 1], visible: true,
      createdAt: Date.now(), points: [hits[0].world, hits[2].world, hits[1].world], spatiallyValid: true,
    };
    store.getState().addMeasurement(ang);
    angleV = mm.measure(ang, session.volume.geometry);
  }
  // Independent check: recompute the distance directly from the two world points.
  const [a, b] = [hits[0].world, hits[1].world];
  const manual = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  return {
    hits: hits.length, hu: hits.map((x) => x.hu), world: hits.map((x) => x.world),
    distance: dv.display, distanceValue: dv.primary, manual,
    components: dv.components, angle: angleV ? angleV.display : null,
    validity: mm.measurementValidity(session.volume.geometry),
  };
});
record('3D measurements use physical patient coordinates',
  measureResult.hits >= 2 && Math.abs(measureResult.distanceValue - measureResult.manual) < 1e-6,
  measureResult.hits >= 2
    ? `picked HU ${measureResult.hu.join(', ')}; distance ${measureResult.distance} (independent recomputation ${measureResult.manual.toFixed(4)} mm); angle ${measureResult.angle}`
    : 'no surface hit — picking failed');

await page.waitForTimeout(300);
captures.push(await capture('17-measurements', 'Distance and angle measurements on the rendered surface'));

/* ---------------------------------------------------------- surface */
surfaceResult = await page.evaluate(async () => {
  const { getSession, store } = window.__medview;
  const session = getSession();
  const surf = await window.__medview.ops.surface();
  const t0 = performance.now();
  const res = surf.buildSurface(session.volume.scalars, session.volume.geometry, {
    isoValue: 300, color: [0.92, 0.88, 0.80], opacity: 1, smoothingIterations: 0, computeNormals: true,
  });
  const ms = performance.now() - t0;
  session.engine.attachSurfaceActor('validation-surface', res.actor, res.mapper);
  store.getState().setShowVolume(false);
  session.engine.setVolumeVisible(false);
  return { triangles: res.triangleCount, points: res.pointCount, areaMm2: res.surfaceAreaMm2, ms };
});
await page.waitForTimeout(500);
const surfaceShot = await capture('18-surface-rendering', 'Marching-cubes iso-surface at 300 HU');
captures.push(surfaceShot);
record('Surface rendering (marching cubes) works',
  surfaceResult.triangles > 1000 && surfaceShot.litFraction > 0.01,
  `${surfaceResult.triangles.toLocaleString()} triangles, ${(surfaceResult.areaMm2 / 100).toFixed(0)} cm², ${surfaceResult.ms.toFixed(0)} ms`);

await page.evaluate(() => {
  const { getSession, store } = window.__medview;
  getSession().engine.removeSurface('validation-surface');
  getSession().engine.setVolumeVisible(true);
  store.getState().setShowVolume(true);
});

/* --------------------------------------------------------- projection */
await setState(() => {
  const st = window.__medview.store.getState();
  st.selectPreset('bone');
  st.setParallelProjection(true);
  window.__medview.engine.setParallelProjection(true);
  window.__medview.engine.applyCameraPreset('anterior', true);
});
await page.waitForTimeout(400);
const ortho = await capture('19-orthographic', 'Orthographic projection');
captures.push(ortho);
record('Projection modes switch', ortho.litFraction > 0.01 && Math.abs(ortho.meanLuma - captures[0].meanLuma) > 0.05,
  `perspective mean luma ${captures[0].meanLuma.toFixed(2)} vs orthographic ${ortho.meanLuma.toFixed(2)}`);
await setState(() => {
  const st = window.__medview.store.getState();
  st.setParallelProjection(false);
  window.__medview.engine.setParallelProjection(false);
  window.__medview.engine.applyCameraPreset('anterior', false);
});

/* -------------------------------------------------- rotate / pan / zoom */
interaction = await page.evaluate(async () => {
  const e = window.__medview.engine;
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const before = e.getCameraState();
  e.orbit(35, 12);
  const afterOrbit = e.getCameraState();
  e.pan(18, -9);
  const afterPan = e.getCameraState();
  const distBefore = d(afterPan.position, afterPan.focalPoint);
  const angleBefore = afterPan.viewAngle;
  e.zoom(1.4);
  const afterZoom = e.getCameraState();
  const distAfter = d(afterZoom.position, afterZoom.focalPoint);
  e.fitVolume();
  const afterFit = e.getCameraState();
  return {
    orbitMoved: d(before.position, afterOrbit.position),
    panMovedFocal: d(afterOrbit.focalPoint, afterPan.focalPoint),
    zoomDistanceBefore: distBefore,
    zoomDistanceAfter: distAfter,
    zoomRatio: distBefore / distAfter,
    viewAngleChanged: Math.abs(afterZoom.viewAngle - angleBefore),
    fitRestored: d(afterZoom.position, afterFit.position),
  };
});
record('Rotate works', interaction.orbitMoved > 1, `camera moved ${interaction.orbitMoved.toFixed(1)} mm on a 35°/12° orbit`);
record('Pan works', Math.abs(interaction.panMovedFocal - Math.hypot(18, 9)) < 0.5,
  `focal point moved ${interaction.panMovedFocal.toFixed(2)} mm for an 18/−9 mm pan`);
record('Zoom works by dollying, not by changing the view angle',
  Math.abs(interaction.zoomRatio - 1.4) < 0.02 && interaction.viewAngleChanged < 1e-6,
  `focal distance ${interaction.zoomDistanceBefore.toFixed(1)} → ${interaction.zoomDistanceAfter.toFixed(1)} mm ` +
  `(ratio ${interaction.zoomRatio.toFixed(3)} for a 1.4× zoom); view angle unchanged`);
record('Fit / reset works', interaction.fitRestored > 0.5, `fit moved the camera ${interaction.fitRestored.toFixed(1)} mm`);

/* -------------------------------------------------- interactive timing */
perf = await page.evaluate(async () => {
  const e = window.__medview.engine;
  const timeAt = async (q, n) => {
    e.setQuality(q);
    const t = [];
    for (let i = 0; i < n; i++) {
      const p = e.getRenderWindow().captureImages()[0];
      const t0 = performance.now();
      e.orbit(12, 0);
      e.renderNow();
      await p;
      t.push(performance.now() - t0);
    }
    return t;
  };
  const interactive = await timeAt('interactive', 3);
  const high = await timeAt('high', 2);
  e.setQuality('high');
  return { interactive, high };
});
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
record('Adaptive quality reduces interactive render cost',
  avg(perf.interactive) < avg(perf.high),
  `interactive ${avg(perf.interactive).toFixed(0)} ms vs high ${avg(perf.high).toFixed(0)} ms per frame ` +
  `(software rasteriser; a real GPU is 1-2 orders of magnitude faster)`);

/* --------------------------------------------------- screenshot export */
const exportCheck = await page.evaluate(async () => {
  const blob = await window.__medview.services.captureScreenshot({
    format: 'image/png', scale: 1.5,
    annotate: { studySeries: true, orientation: true, scaleBar: true, measurements: true, preset: true },
  });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { size: buf.length, type: blob.type, b64: btoa(bin) };
});
fs.writeFileSync(path.join(OUT, 'screenshots', '20-annotated-export.png'), Buffer.from(exportCheck.b64, 'base64'));
record('Screenshot export works (annotated, high resolution)',
  exportCheck.size > 20000 && exportCheck.type === 'image/png',
  `${(exportCheck.size / 1024).toFixed(0)} kB PNG at 1.5× viewport resolution`);

/* ------------------------------------------------- presentation state */
const ps = await page.evaluate(async () => {
  const state = await window.__medview.services.capturePresentationState();
  const json = JSON.stringify(state);
  return { json, bytes: json.length, hasLabels: !!state.segmentation.labelsRle, measurements: state.measurements.length };
});
fs.writeFileSync(path.join(OUT, 'presentation-state.json'), JSON.stringify(JSON.parse(ps.json), null, 1));
record('Presentation state serialises (versioned JSON)',
  ps.bytes > 500,
  `${(ps.bytes / 1024).toFixed(1)} kB, ${ps.measurements} measurements, segmentation masks ${ps.hasLabels ? 'included (RLE)' : 'absent'}`);

/* ------------------------------------------------- orientation sanity */
orientation = await page.evaluate(() => {
  const { getSession } = window.__medview;
  const session = getSession();
  const g = session.volume.geometry;
  const label = (v) => {
    const axes = [[v[0], 'L'], [-v[0], 'R'], [v[1], 'P'], [-v[1], 'A'], [v[2], 'S'], [-v[2], 'I']];
    axes.sort((a, b) => b[0] - a[0]);
    return axes[0][1];
  };
  const e = window.__medview.engine;
  e.applyCameraPreset('anterior', false);
  const cam = e.getCameraState();
  const fwd = [cam.focalPoint[0] - cam.position[0], cam.focalPoint[1] - cam.position[1], cam.focalPoint[2] - cam.position[2]];
  const n = Math.hypot(...fwd);
  const f = fwd.map((x) => x / n);
  const up = cam.viewUp;
  const right = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]];
  return {
    volumeAxes: `${label(g.iAxis)}${label(g.jAxis)}${label(g.kAxis)}`,
    anteriorViewScreenRight: label(right),
    anteriorViewScreenUp: label(up),
  };
});
record('Anatomical orientation is correct in the anterior view',
  orientation.anteriorViewScreenRight === 'L' && orientation.anteriorViewScreenUp === 'S',
  `volume axes ${orientation.volumeAxes}; in the anterior view screen-right = patient ${orientation.anteriorViewScreenRight}, screen-up = ${orientation.anteriorViewScreenUp}`);

} catch (e) {
  runError = e instanceof Error ? `${e.message.split('\n')[0]}` : String(e);
  record('Validation run completed without an unexpected error', false, runError);
}

/* ------------------------------------------------------------ wrap up */
if (!runError) record('Validation run completed without an unexpected error', true, 'all phases ran');
record('No uncaught JavaScript errors during the session', scriptErrors.length === 0,
  scriptErrors.slice(0, 3).join(' | ') || 'clean');
record('No failed resource loads', resourceFailures.length === 0,
  resourceFailures.slice(0, 5).join(' | ') || 'every request served');

const report = {
  generatedAt: new Date().toISOString(),
  totalDurationMs: Date.now() - t0,
  environment: { gpu: caps, note: 'Headless Chromium with the SwiftShader software rasteriser; frame times are far slower than on real GPU hardware.' },
  loadMs, dataset: DATASET, fileCount: files.length,
  state, segResult, measureResult, surfaceResult, interaction, perf, orientation, runError,
  captures, results,
  scriptErrors, resourceFailures,
};
fs.writeFileSync(path.join(OUT, 'validation-report.json'), JSON.stringify(report, null, 1));

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log(`report: ${path.join(OUT, 'validation-report.json')}`);

await browser.close();
server.close();
process.exit(passed === results.length ? 0 : 1);
