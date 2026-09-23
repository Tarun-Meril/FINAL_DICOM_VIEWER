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

  page.on('console', msg => {
    const text = msg.text();
    if (!text.includes('Download the React DevTools') && !text.includes('[vite]')) {
      console.log('[BROWSER]', msg.type(), text);
    }
  });

  console.log('Navigating to viewer...');
  await page.goto('http://127.0.0.1:5174/viewer/1.3.46.670589.33.1.63920665120842380200001.5535694576552993899', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  await page.waitForFunction(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.some(b => (b.innerText || '').includes('MPR') || (b.getAttribute('title') || '').includes('MPR'));
  }, { timeout: 15000 });

  await new Promise(r => setTimeout(r, 4000));

  console.log('Clicking MPR button...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const mprBtn = btns.find(b => (b.innerText || '').includes('MPR') || (b.getAttribute('title') || '').includes('MPR'));
    mprBtn.click();
  });

  console.log('Waiting for volume load...');
  await page.waitForFunction(() => {
    const cs = window.cornerstone;
    const vols = cs?.cache?.getVolumes();
    return vols && vols.length > 0;
  }, { timeout: 45000 });

  await page.waitForFunction(() => {
    const text = document.body.innerText || '';
    return text.includes('175 of 175') || (text.includes('175') && !text.includes('STREAMING'));
  }, { timeout: 60000 }).catch(() => console.log('Timeout waiting for text, proceeding anyway...'));

  await new Promise(r => setTimeout(r, 4000));

  const deepCheck = await page.evaluate(() => {
    const cs = window.cornerstone;
    const re = cs?.getRenderingEngine('merilview-mpr-engine');
    if (!re) return { error: 'Rendering engine not found' };
    const vp = re.getViewport('MPR_AXIAL');
    if (!vp) return { error: 'Viewport MPR_AXIAL not found' };
    const actEntry = vp.getActors()[0];
    const act = actEntry?.actor;
    const mapper = act?.getMapper();
    const prop = act?.getProperty();
    const cam = vp.getCamera();
    const vtkCam = vp.getVtkActiveCamera();

    const rgb = prop?.getRGBTransferFunction(0);
    const rgbTable = [];
    if (rgb) {
      const range = rgb.getRange();
      const n = 10;
      const step = (range[1] - range[0]) / n;
      for (let i = 0; i <= n; i++) {
        const val = range[0] + i * step;
        const color = [0, 0, 0];
        rgb.getColor(val, color);
        rgbTable.push({ val, color });
      }
    }

    const pwf = prop?.getScalarOpacity(0);
    const pwfTable = [];
    if (pwf) {
      const range = pwf.getRange();
      const n = 10;
      const step = (range[1] - range[0]) / n;
      for (let i = 0; i <= n; i++) {
        const val = range[0] + i * step;
        pwfTable.push({ val, opacity: pwf.getValue(val) });
      }
    }

    const planes = mapper?.getClippingPlanes ? mapper.getClippingPlanes() : [];
    const planesData = planes.map(p => ({
      origin: p.getOrigin(),
      normal: p.getNormal()
    }));

    const vol = cs.cache.getVolumes()[0];
    const tex = vol?.vtkOpenGLTexture;
    const volInfo = tex?.getVolumeInfo ? tex.getVolumeInfo() : null;

    return {
      visibility: act?.getVisibility(),
      bounds: act?.getBounds(),
      ipScalarRange: prop?.getIpScalarRange ? prop.getIpScalarRange() : null,
      volInfo,
      mapperClassName: mapper?.getClassName(),
      blendMode: mapper?.getBlendMode ? mapper.getBlendMode() : null,
      camera: {
        focalPoint: cam.focalPoint,
        position: cam.position,
        clippingRange: cam.clippingRange,
        parallelScale: cam.parallelScale,
        viewPlaneNormal: cam.viewPlaneNormal,
        viewUp: cam.viewUp,
        vtkCamDistance: vtkCam?.getDistance(),
        vtkCamClippingRange: vtkCam?.getClippingRange()
      },
      planesData,
      rgbRange: rgb?.getRange(),
      pwfRange: pwf?.getRange(),
      independentComponents: prop?.getIndependentComponents(),
      interpolationType: prop?.getInterpolationType(),
      shade: prop?.getShade()
    };
  });

  console.log('=== DEEP CHECK ===\n', JSON.stringify(deepCheck, null, 2));

  console.log('Testing convertMapperToNotSharedMapper & inspecting state...');
  const vtkDiag = await page.evaluate(() => {
    try {
      const cs = window.cornerstone;
      const re = cs.getRenderingEngine('merilview-mpr-engine');
      if (!re) return { error: 'Engine not found' };

      const { convertMapperToNotSharedMapper } = cs;
      const planes = ['MPR_AXIAL', 'MPR_CORONAL', 'MPR_SAGITTAL'];
      const convertOut = {};

      for (const plane of planes) {
        const vp = re.getViewport(plane);
        if (!vp) continue;
        const actEntry = vp.getActors()[0];
        const act = actEntry?.actor;
        if (!act) continue;

        const mapper = act.getMapper();
        const oldClass = mapper.getClassName();
        const inputData = mapper.getInputData();
        const vm = inputData?.get('voxelManager');
        const values = vm?.voxelManager?.getCompleteScalarDataArray?.() || vm?.getCompleteScalarDataArray?.();
        const clippingPlanes = mapper.getClippingPlanes ? mapper.getClippingPlanes() : [];
        const nonShared = convertMapperToNotSharedMapper(mapper);

        for (const p of clippingPlanes) {
          nonShared.addClippingPlane(p);
        }
        act.setMapper(nonShared);

        convertOut[plane] = {
          oldClass,
          newClass: nonShared.getClassName(),
          hasVoxelManager: !!vm,
          valuesLength: values?.length,
          sampleValue: values ? values[Math.floor(values.length / 2)] : null,
          clippingPlanesCount: nonShared.getClippingPlanes().length
        };
      }

      re.render();

      const vp = re.getViewport('MPR_AXIAL');
      const cv = vp.canvas;
      const vtkRenderer = vp.getRenderer();

      const engineImpl = re._implementation || re;
      const offMulti = engineImpl.offscreenMultiRenderWindow;
      const openGLRenderWindow = offMulti?.getOpenGLRenderWindow?.();
      const offCtx = openGLRenderWindow?.get3DContext?.();
      const offCanvas = offCtx?.canvas;

      let offGlInfo = null;
      let offSampleNonZero = 0;
      if (offCtx) {
        offGlInfo = {
          isContextLost: offCtx.isContextLost(),
          drawingBufferWidth: offCtx.drawingBufferWidth,
          drawingBufferHeight: offCtx.drawingBufferHeight,
          error: offCtx.getError(),
          canvasWidth: offCanvas?.width,
          canvasHeight: offCanvas?.height
        };
        const p = new Uint8Array(4);
        offCtx.readPixels(Math.floor(offCtx.drawingBufferWidth / 2), Math.floor(offCtx.drawingBufferHeight / 2), 1, 1, offCtx.RGBA, offCtx.UNSIGNED_BYTE, p);
        offGlInfo.centerPixel = Array.from(p);
      }

      // Check onscreen canvas 2d context
      const ctx2d = cv.getContext('2d');
      let onscreenCenterPixel = null;
      if (ctx2d) {
        const idata = ctx2d.getImageData(Math.floor(cv.width / 2), Math.floor(cv.height / 2), 1, 1);
        onscreenCenterPixel = Array.from(idata.data);
      }

      const vtkActors = vtkRenderer?.getActors() || [];
      const actorsInfo = vtkActors.map(a => ({
        className: a.getClassName(),
        visibility: a.getVisibility(),
        bounds: a.getBounds(),
        mapper: a.getMapper() ? {
          className: a.getMapper().getClassName(),
          bounds: a.getMapper().getBounds(),
          scalars: a.getMapper().getInputData()?.getPointData()?.getScalars() ? 'hasScalars' : 'noScalars'
        } : null
      }));

      return {
        convertOut,
        canvas: {
          width: cv.width,
          height: cv.height,
          clientWidth: cv.clientWidth,
          clientHeight: cv.clientHeight,
          onscreenCenterPixel
        },
        offGlInfo,
        actorsInfo,
        renderer: {
          background: vtkRenderer?.getBackground(),
          activeCamera: !!vtkRenderer?.getActiveCamera(),
          visiblePropBounds: vtkRenderer?.computeVisiblePropBounds()
        }
      };
    } catch (e) {
      return { error: e.message, stack: e.stack };
    }
  });

  console.log('=== VTK DIAGNOSTICS ===\n', JSON.stringify(vtkDiag, null, 2));

  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: 'mpr_after_convert_test.png' });
  await browser.close();
})();
