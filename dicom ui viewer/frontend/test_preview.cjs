const { chromium } = require('playwright');
const path = require('path');

const ARTIFACTS_DIR = 'C:\\Users\\Tarun\\.gemini\\antigravity\\brain\\540c97ae-605e-4737-8808-b03cca32e9ec';

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=default',
      '--enable-webgl',
      '--enable-webgl2-compute-context',
      '--ignore-gpu-blocklist',
      '--no-sandbox'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 950 }
  });

  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[MPR]') || text.includes('[StudyManager]') || text.includes('[VolumeManager]') || text.includes('[CinematicVR]') || text.includes('Error') || text.includes('error')) {
      console.log(`[BROWSER ${msg.type()}]: ${text}`);
    }
  });

  page.on('pageerror', err => {
    console.error(`[PAGE UNCAUGHT ERROR]:`, err.message);
  });

  console.log('--- Step 1: Navigating to CT Study in MedView PRO Viewer ---');
  // CT Study: Fatima Bhanpurwala CT ABD CONT
  const studyUid = '1.3.46.670589.33.1.63920660937429831000001.5462275000837404300';
  await page.goto(`http://localhost:5174/viewer/${studyUid}`, { waitUntil: 'domcontentloaded' });

  // Wait for 2D view to render
  console.log('Waiting for viewer to load...');
  await page.waitForTimeout(5000);

  console.log('--- Step 2: Clicking the MPR button in toolbar ---');
  const mprBtn = page.locator('button[title="Multiplanar Reconstruction"]').first();
  await mprBtn.click();
  console.log('Clicked MPR button. Waiting for MPRWorkspace to initialize...');

  // Wait for MPR workspace and volume loading
  await page.waitForTimeout(10000);

  const mprScreenshot = path.join(ARTIFACTS_DIR, 'ct_mpr_workspace.png');
  await page.screenshot({ path: mprScreenshot, fullPage: false });
  console.log(`Saved MPR workspace screenshot to ${mprScreenshot}`);

  // Try clicking Bone preset if present
  console.log('--- Step 3: Testing Presets (Bone) ---');
  const boneBtn = page.locator('button:has-text("Bone")').first();
  if (await boneBtn.isVisible()) {
    console.log('Found Bone preset button, clicking...');
    await boneBtn.click();
    await page.waitForTimeout(2000);
    const boneScreenshot = path.join(ARTIFACTS_DIR, 'ct_mpr_bone_preset.png');
    await page.screenshot({ path: boneScreenshot, fullPage: false });
    console.log(`Saved Bone preset screenshot to ${boneScreenshot}`);
  } else {
    console.log('Bone preset button not found directly.');
  }

  // Try clicking Lung preset if present
  console.log('--- Step 4: Testing Presets (Lung) ---');
  const lungBtn = page.locator('button:has-text("Lung")').first();
  if (await lungBtn.isVisible()) {
    console.log('Found Lung preset button, clicking...');
    await lungBtn.click();
    await page.waitForTimeout(2000);
    const lungScreenshot = path.join(ARTIFACTS_DIR, 'ct_mpr_lung_preset.png');
    await page.screenshot({ path: lungScreenshot, fullPage: false });
    console.log(`Saved Lung preset screenshot to ${lungScreenshot}`);
  }

  await browser.close();
  console.log('All tests completed successfully.');
}

run().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
