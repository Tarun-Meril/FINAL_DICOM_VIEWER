import { defineConfig } from '@playwright/test';

/**
 * Browser end-to-end suite (§37). It drives the real UI — clicking the real toolbar —
 * against a real DICOM study, so it exercises the same path a user takes.
 *
 * MEDVIEW_TEST_DATASET points at a directory of DICOM files.
 * CHROME_PATH overrides the Chromium binary.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 60 * 1000,
  expect: { timeout: 5 * 60 * 1000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 960 },
    actionTimeout: 5 * 60 * 1000,
    navigationTimeout: 5 * 60 * 1000,
    launchOptions: {
      executablePath: process.env.CHROME_PATH,
      args: [
        '--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle',
        '--use-angle=swiftshader', '--disable-dev-shm-usage',
        '--disable-background-networking', '--disable-component-update', '--no-first-run',
        '--js-flags=--max-old-space-size=4096',
      ],
    },
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
