import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', error => logs.push(`[pageerror] ${error.message}`));
  
  page.on('requestfailed', request =>
    logs.push(`[network-error] ${request.url()} - ${request.failure()?.errorText}`)
  );

  try {
    await page.goto('http://127.0.0.1:5174/viewer/1.3.46.670589.11.80822.5.0.14612.2025120908461716066', { waitUntil: 'networkidle', timeout: 10000 });
  } catch (err) {
    logs.push(`[goto-error] ${err.message}`);
  }
  
  fs.writeFileSync('C:/Users/Tarun/.gemini/antigravity-ide/brain/6e3a01bf-19e7-4695-be33-5d841a2a658e/browser-logs.txt', logs.join('\n'));
  await browser.close();
})();
