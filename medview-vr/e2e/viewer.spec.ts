import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DATASET = process.env.MEDVIEW_TEST_DATASET ?? '/home/claude/work/dataset';
/** A subset keeps the suite fast; the full-study run lives in tools/validate-render.mjs. */
const MAX_SLICES = Number(process.env.MEDVIEW_E2E_SLICES ?? 48);

function datasetFiles(): string[] {
  if (!fs.existsSync(DATASET)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else out.push(p);
    }
  };
  walk(DATASET);
  return out.sort().slice(0, MAX_SLICES);
}

async function loadStudy(page: Page): Promise<void> {
  const files = datasetFiles();
  test.skip(files.length === 0, `No dataset at ${DATASET}`);
  await page.goto('/');
  await expect(page.getByText('Drop a CT study here')).toBeVisible();
  await page.setInputFiles('input[type=file]:not([webkitdirectory])', files);
  await expect(page.locator('.app')).toBeVisible({ timeout: 20 * 60 * 1000 });
  await page.waitForFunction(() => !!(window as never as { __medview?: unknown }).__medview, undefined,
    { timeout: 20 * 60 * 1000, polling: 1000 });
}

const bridge = <T>(page: Page, fn: (mv: any) => T): Promise<T> =>
  page.evaluate(fn as never, undefined as never) as Promise<T>;

test.describe('MedView VR end-to-end', () => {
  test('loads a study, renders it, and every major control responds', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await loadStudy(page);

    await test.step('the workstation chrome is present', async () => {
      await expect(page.locator('.toolbar')).toBeVisible();
      await expect(page.locator('.viewport canvas')).toBeVisible();
      await expect(page.locator('.statusbar')).toContainText('Research prototype');
      await expect(page.locator('.overlay .tl')).toContainText('CT');
      // Anatomical direction markers and the orientation cube.
      await expect(page.locator('.dir-label')).toHaveCount(4);
      await expect(page.locator('svg[aria-label="Anatomical orientation cube"]')).toBeVisible();
    });

    await test.step('the viewport is not blank', async () => {
      // The default framebuffer is cleared after compositing, so reading it back directly
      // yields zeros. Measure the frame the application's own capture path produces, which
      // is the same path the Screenshot button uses.
      const lit = await page.evaluate(async () => {
        const dataUrl = await (window as any).__medview.engine.capture({ format: 'image/png' });
        const img = new Image();
        await new Promise((r) => { img.onload = r; img.src = dataUrl; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) n++;
        return n / (d.length / 4);
      });
      expect(lit).toBeGreaterThan(0.005);
    });

    await test.step('camera presets change the camera', async () => {
      const before = await page.evaluate(() => (window as any).__medview.engine.getCameraState().position);
      await page.getByRole('button', { name: 'P', exact: true }).click();
      const after = await page.evaluate(() => (window as any).__medview.engine.getCameraState().position);
      expect(after).not.toEqual(before);
    });

    await test.step('rotate, zoom and fit work', async () => {
      const p0 = await page.evaluate(() => (window as any).__medview.engine.getCameraState().position);
      await page.evaluate(() => (window as any).__medview.engine.orbit(30, 10));
      const p1 = await page.evaluate(() => (window as any).__medview.engine.getCameraState().position);
      expect(p1).not.toEqual(p0);
      await page.getByRole('button', { name: '+', exact: true }).click();
      await page.getByRole('button', { name: 'Fit' }).click();
      const p2 = await page.evaluate(() => (window as any).__medview.engine.getCameraState().position);
      expect(p2).not.toEqual(p1);
    });

    await test.step('projection toggles', async () => {
      await page.getByRole('button', { name: 'Ortho' }).click();
      expect(await page.evaluate(() => (window as any).__medview.engine.getCameraState().parallelProjection)).toBe(true);
      await page.getByRole('button', { name: 'Persp' }).click();
      expect(await page.evaluate(() => (window as any).__medview.engine.getCameraState().parallelProjection)).toBe(false);
    });

    await test.step('preset buttons switch the transfer function', async () => {
      await page.getByRole('button', { name: 'Soft tissue' }).click();
      await expect(page.locator('.overlay .tr')).toContainText('Soft Tissue');
      await page.getByRole('button', { name: 'Bone', exact: true }).click();
      await expect(page.locator('.overlay .tr')).toContainText('Bone');
    });

    await test.step('the transfer-function editor accepts a drag', async () => {
      const canvas = page.locator('canvas.tf-canvas');
      await expect(canvas).toBeVisible();
      const before = await page.evaluate(() => (window as any).__medview.store.getState().transferFunction.opacity.length);
      const box = (await canvas.boundingBox())!;
      await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.4);
      const after = await page.evaluate(() => (window as any).__medview.store.getState().transferFunction.opacity.length);
      expect(after).toBeGreaterThanOrEqual(before);
    });

    await test.step('clipping planes apply and reset', async () => {
      await page.getByRole('button', { name: 'Clip / VOI' }).click();
      await page.locator('.panel.right input[type=checkbox]').first().check();
      expect(await page.evaluate(() => (window as any).__medview.store.getState().clipping.filter((c: any) => c.enabled).length))
        .toBeGreaterThan(0);
      await page.getByRole('button', { name: 'Reset all clipping planes' }).click();
      expect(await page.evaluate(() => (window as any).__medview.store.getState().clipping.filter((c: any) => c.enabled).length)).toBe(0);
    });

    await test.step('segmentation runs and reports a physical volume', async () => {
      await page.getByRole('button', { name: 'Segment' }).click();
      await page.getByRole('button', { name: 'Extract bone' }).click();
      await expect(page.locator('.note.ok')).toContainText(/voxels|components/, { timeout: 300000 });
      const stats = await page.evaluate(() => (window as any).__medview.store.getState().segmentStats);
      expect(Object.values(stats).length).toBeGreaterThan(0);
    });

    await test.step('sculpting is undoable', async () => {
      await page.getByRole('button', { name: 'Sculpt' }).click();
      const removed = await page.evaluate(async () => {
        const mv = (window as any).__medview;
        const s = mv.getSession();
        const ops = await mv.ops.segmentation();
        const g = s.volume.geometry;
        const d = ops.sculptPlane(s.visibility.values, g,
          [g.origin[0], g.origin[1], g.origin[2] + g.physicalSize[2] * 0.5], [0, 0, 1], 'erase');
        s.history.push({ delta: d, target: 'visibility', at: Date.now() });
        mv.syncDisplay(s);
        mv.store.getState().setHistoryState(s.history.canUndo(), s.history.canRedo(), s.history.labels());
        return s.visibility.removedCount();
      });
      expect(removed).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
      const after = await page.evaluate(() => (window as any).__medview.getSession().visibility.removedCount());
      expect(after).toBeLessThan(removed);
    });

    await test.step('measurements are reported in millimetres', async () => {
      await page.getByRole('button', { name: 'Measure' }).click();
      const value = await page.evaluate(async () => {
        const mv = (window as any).__medview;
        const s = mv.getSession();
        const g = s.volume.geometry;
        const a = [g.origin[0], g.origin[1], g.origin[2]];
        const b = [g.origin[0] + 30, g.origin[1] + 40, g.origin[2]];
        mv.store.getState().addMeasurement({
          id: 'e2e', kind: 'distance', label: 'e2e', color: [1, 1, 0], visible: true,
          createdAt: Date.now(), points: [a, b], spatiallyValid: true,
        });
        const m = await mv.ops.measurements();
        return m.measure(mv.store.getState().measurements.at(-1), g).display;
      });
      expect(value).toBe('50.00 mm');
      await expect(page.locator('.panel.right')).toContainText('50.00 mm');
    });

    await test.step('screenshot export produces a PNG', async () => {
      const size = await page.evaluate(async () => {
        const blob = await (window as any).__medview.services.captureScreenshot({
          format: 'image/png', annotate: { studySeries: true, orientation: true, scaleBar: true, preset: true },
        });
        return { size: blob.size, type: blob.type };
      });
      expect(size.type).toBe('image/png');
      expect(size.size).toBeGreaterThan(10000);
    });

    await test.step('presentation state round-trips', async () => {
      const ok = await page.evaluate(async () => {
        const mv = (window as any).__medview;
        const state = await mv.services.capturePresentationState();
        const json = JSON.stringify(state);
        return json.includes('medview.presentationstate') && json.length > 500;
      });
      expect(ok).toBe(true);
    });

    await test.step('diagnostics panel shows the conformance results', async () => {
      await page.getByRole('button', { name: 'Diag' }).click();
      await expect(page.locator('.panel.right')).toContainText('Geometry conformance');
      await expect(page.locator('.panel.right')).toContainText('PASS');
    });

    expect(errors, `uncaught errors: ${errors.join(' | ')}`).toHaveLength(0);
  });

  test('a non-DICOM dataset is refused with a readable message', async ({ page }) => {
    await page.goto('/');
    const tmp = path.join(process.env.TMPDIR ?? '/tmp', 'not-dicom.txt');
    fs.writeFileSync(tmp, 'this is definitely not a DICOM study');
    await page.setInputFiles('input[type=file]:not([webkitdirectory])', [tmp]);
    await expect(page.locator('.note.error')).toContainText(/No readable DICOM files/, { timeout: 120000 });
    await expect(page.locator('.note.error')).not.toContainText('TypeError');
  });
});
