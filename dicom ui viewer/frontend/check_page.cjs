const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  try {
    await page.goto('http://127.0.0.1:5174/viewer/1.3.46.670589.11.80822.5.0.14612.2025120908461716066', { waitUntil: 'networkidle2', timeout: 5000 });
  } catch (err) {
    console.log('GOTO ERROR:', err.message);
  }
  
  await new Promise(r => setTimeout(r, 2000));
  
  const title = await page.title();
  console.log('PAGE TITLE:', title);
  
  const content = await page.content();
  console.log('PAGE BODY LENGTH:', content.length);
  
  await browser.close();
})();
