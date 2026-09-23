const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--enable-features=SharedArrayBuffer',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle'
    ]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  page.on('console', msg => console.log('[BROWSER]', msg.type(), msg.text()));

  console.log('Navigating to viewer...');
  await page.goto('http://localhost:5174/viewer/1.3.46.670589.33.1.63920665120842380200001.5535694576552993899', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  await page.waitForFunction(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.some(b => (b.innerText || '').includes('MPR') || (b.getAttribute('title') || '').includes('MPR'));
  }, { timeout: 15000 });

  await new Promise(r => setTimeout(r, 3000));

  console.log('Clicking MPR button...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const mprBtn = btns.find(b => (b.innerText || '').includes('MPR') || (b.getAttribute('title') || '').includes('MPR'));
    mprBtn.click();
  });

  console.log('Waiting for volume load completion...');
  await page.waitForFunction(() => {
    const text = document.body.innerText || '';
    return text.includes('175 of 175') || (text.includes('175') && !text.includes('STREAMING'));
  }, { timeout: 60000 }).catch(() => console.log('Timeout waiting for text...'));

  await new Promise(r => setTimeout(r, 4000));

  console.log('Testing convertMapperToNotSharedMapper...');
  const convertResult = await page.evaluate(() => {
    const cs = window.cornerstone;
    const { convertMapperToNotSharedMapper } = cs;
    const re = cs.getRenderingEngine('merilview-mpr-engine');
    if (!re) return { error: 'Rendering engine not found' };

    const planes = ['MPR_AXIAL', 'MPR_CORONAL', 'MPR_SAGITTAL'];
    const results = {};

    for (const plane of planes) {
      const vp = re.getViewport(plane);
      if (!vp) continue;
      const actors = vp.getActors();
      if (!actors || !actors.length) continue;
      const act = actors[0].actor;
      const mapper = act.getMapper();
      const clippingPlanes = mapper.getClippingPlanes ? mapper.getClippingPlanes() : [];
      
      const nonShared = convertMapperToNotSharedMapper(mapper);
      for (const p of clippingPlanes) {
        nonShared.addClippingPlane(p);
      }
      act.setMapper(nonShared);

      // Check actor properties
      const prop = act.getProperty();
      const pwf = prop?.getScalarOpacity ? prop.getScalarOpacity(0) : null;
      if (pwf && pwf.removeAllPoints) {
        pwf.removeAllPoints();
        pwf.addPoint(-2048, 1.0);
        pwf.addPoint(4096, 1.0);
      }

      results[plane] = {
        oldMapper: mapper.getClassName(),
        newMapper: nonShared.getClassName(),
        clippingPlanesCount: clippingPlanes.length
      };
    }

    re.render();
    return results;
  });

  console.log('Convert result:', JSON.stringify(convertResult, null, 2));

  await new Promise(r => setTimeout(r, 2000));

  await page.screenshot({ path: 'mpr_after_convert.png' });
  console.log('Saved mpr_after_convert.png');

  await browser.close();
})();
