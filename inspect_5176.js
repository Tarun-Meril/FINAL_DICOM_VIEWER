const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--enable-features=SharedArrayBuffer', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto('http://localhost:5176');
  await new Promise(r => setTimeout(r, 10000));
  const result = await page.evaluate(() => {
    const cs = window.cornerstone;
    const re = cs?.getRenderingEngine ? cs.getRenderingEngine('merilview-mpr-engine') : null;
    const vp = re?.getViewport('MPR_AXIAL');
    const actors = vp?.getActors();
    const actor = actors && actors[0] ? actors[0].actor : null;
    if (!actor) return { error: 'no actor' };
    const prop = actor.getProperty();
    const rgb = prop?.getRGBTransferFunction(0);
    const pwf = prop?.getScalarOpacity ? prop.getScalarOpacity(0) : (prop?.getPiecewiseFunction ? prop.getPiecewiseFunction(0) : null);
    
    let rgbPoints = [];
    if (rgb && rgb.getDataPointer) {
      rgbPoints = Array.from(rgb.getDataPointer()).slice(0, 20);
    }
    let pwfPoints = [];
    if (pwf && pwf.getDataPointer) {
      pwfPoints = Array.from(pwf.getDataPointer()).slice(0, 20);
    }

    return {
      mapper: actor.getMapper() ? actor.getMapper().getClassName() : null,
      rgbRange: rgb?.getRange ? rgb.getRange() : null,
      pwfRange: pwf?.getRange ? pwf.getRange() : null,
      rgbSize: rgb?.getSize ? rgb.getSize() : null,
      pwfSize: pwf?.getSize ? pwf.getSize() : null,
      rgbPoints,
      pwfPoints,
      camera: vp?.getCamera ? vp.getCamera() : null
    };
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
