import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`[Browser ${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.log(`[Browser Error] ${err}`);
  });

  console.log("Navigating to viewer...");
  await page.goto('http://127.0.0.1:5174/viewer/1.3.46.670589.11.80822.5.0.14612.2025120812551725028', { waitUntil: 'domcontentloaded' });
  
  console.log("Waiting 10 seconds for Cornerstone to initialize...");
  await new Promise(r => setTimeout(r, 10000));
  
  await browser.close();
  console.log("Done.");
})();
