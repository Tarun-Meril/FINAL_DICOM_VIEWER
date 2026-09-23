import { useRef } from 'react';
import { useAppStore } from '@/state/store';
import { getSession, syncDisplay } from '@/state/session';
import { CAMERA_PRESETS } from '@/rendering/camera';
import { captureScreenshot, capturePresentationState } from '@/services/exportService';
import { parsePresentationState, matchesVolume, decodeMaskRle } from '@/state/presentationState';
import { downloadBlob, downloadText, slug } from '@/utils/download';
import { APP_NAME, APP_VERSION } from '@/core/version';

export function Toolbar(): JSX.Element {
  const s = useAppStore();
  const session = getSession();
  const stateFileRef = useRef<HTMLInputElement>(null);
  const engine = session?.engine ?? null;

  const undo = () => {
    if (!session) return;
    const e = session.history.undo((t) => (t === 'labels' ? session.labels.labels : session.visibility.values));
    if (e?.target === 'visibility') syncDisplay(session);
    s.setHistoryState(session.history.canUndo(), session.history.canRedo(), session.history.labels());
  };
  const redo = () => {
    if (!session) return;
    const e = session.history.redo((t) => (t === 'labels' ? session.labels.labels : session.visibility.values));
    if (e?.target === 'visibility') syncDisplay(session);
    s.setHistoryState(session.history.canUndo(), session.history.canRedo(), session.history.labels());
  };

  const screenshot = async (scale: number) => {
    try {
      const blob = await captureScreenshot({
        format: 'image/png', scale,
        annotate: { studySeries: true, orientation: true, scaleBar: true, measurements: true, preset: true },
      });
      downloadBlob(blob, `medview-${slug(s.transferFunction.name)}-${Date.now()}.png`);
    } catch (e) {
      s.pushRuntimeIssue({ code: 'RENDER_FAILED', severity: 'error', message: 'The screenshot could not be created.', detail: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="toolbar">
      <div className="brand"><b>{APP_NAME}</b><span>v{APP_VERSION} · prototype</span></div>

      <div className="tb-group">
        <button className="tb-btn" data-active={s.tool === 'navigate'} onClick={() => s.setTool('navigate')}
          title="Left drag orbit · middle drag pan · wheel zoom · double-click fit">Navigate</button>
        <button className="tb-btn" onClick={() => engine?.fitVolume()} title="Fit the whole volume to the viewport">Fit</button>
        <button className="tb-btn" onClick={() => engine?.zoom(1.2)} title="Zoom in">+</button>
        <button className="tb-btn" onClick={() => engine?.zoom(1 / 1.2)} title="Zoom out">−</button>
      </div>

      <div className="tb-sep" />
      <div className="tb-group">
        {CAMERA_PRESETS.slice(0, 6).map((p) => (
          <button key={p.id} className="tb-btn" title={`${p.label} — ${p.description}`}
            data-active={s.cameraPreset === p.id}
            onClick={() => { engine?.applyCameraPreset(p.id, s.parallelProjection); s.setCameraPreset(p.id); }}>
            {p.label.match(/\(([A-Z])\)/)?.[1] ?? p.label}
          </button>
        ))}
        <select value="" title="Oblique views"
          onChange={(e) => { if (!e.target.value) return; engine?.applyCameraPreset(e.target.value as never, s.parallelProjection); s.setCameraPreset(e.target.value as never); e.target.value = ''; }}
          style={{ width: 96, height: 26 }}>
          <option value="">Oblique…</option>
          {CAMERA_PRESETS.slice(6).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>

      <div className="tb-sep" />
      <div className="tb-group">
        <button className="tb-btn" data-active={!s.parallelProjection} onClick={() => s.setParallelProjection(false)}
          title="Perspective projection — realistic depth">Persp</button>
        <button className="tb-btn" data-active={s.parallelProjection} onClick={() => s.setParallelProjection(true)}
          title="Orthographic projection — no perspective distortion, preferable for inspection">Ortho</button>
      </div>

      <div className="tb-sep" />
      <div className="tb-group">
        <button className="tb-btn" data-active={s.showVolume} onClick={() => s.setShowVolume(!s.showVolume)}
          title={s.showVolume ? 'Hide 3D volume rendering' : 'Show 3D volume rendering'}>
          {s.showVolume ? 'Hide Volume' : 'Show Volume'}
        </button>
      </div>

      <div className="tb-sep" />
      <div className="tb-group">
        <button className="tb-btn" onClick={() => s.selectPreset('bone')} data-active={s.transferFunction.id === 'bone'}>Bone</button>
        <button className="tb-btn" onClick={() => s.selectPreset('soft-tissue')} data-active={s.transferFunction.id === 'soft-tissue'}>Soft tissue</button>
        <button className="tb-btn" onClick={() => s.selectPreset('vascular-cta')} data-active={s.transferFunction.id === 'vascular-cta'}>CTA</button>
        <button className="tb-btn" onClick={() => s.selectPreset('skin')} data-active={s.transferFunction.id === 'skin'}>Skin</button>
      </div>

      <div className="tb-sep" />
      <div className="tb-group">
        <button className="tb-btn" onClick={undo} disabled={!s.canUndo} title="Undo the last mask edit">Undo</button>
        <button className="tb-btn" onClick={redo} disabled={!s.canRedo} title="Redo">Redo</button>
      </div>

      <div className="spacer" />

      <div className="tb-group">
        <button className="tb-btn" onClick={() => screenshot(1)} title="Export the current view as a PNG">Screenshot</button>
        <button className="tb-btn" onClick={() => screenshot(2)} title="Export at twice the viewport resolution">2× PNG</button>
        <button className="tb-btn" title="Save every rendering setting, mask and measurement as JSON"
          onClick={() => { try { downloadText(JSON.stringify(capturePresentationState(), null, 1), `medview-state-${Date.now()}.json`); } catch (e) { s.pushRuntimeIssue({ code: 'INTERNAL', severity: 'error', message: String(e) }); } }}>
          Save state
        </button>
        <button className="tb-btn" onClick={() => stateFileRef.current?.click()} title="Restore a saved presentation state">Load state</button>
        <input ref={stateFileRef} type="file" accept="application/json" style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f || !session) return;
            try {
              const ps = parsePresentationState(await f.text());
              const m = matchesVolume(ps, session.volume.provenance.seriesInstanceUID, session.volume.geometry.dimensions);
              if (!m.matches) { s.pushRuntimeIssue({ code: 'INTERNAL', severity: 'warning', message: m.reason! }); }
              s.setTransferFunction(ps.transferFunction);
              s.setBlendMode(ps.blendMode);
              s.setQuality(ps.quality);
              s.setRenderMode(ps.renderMode);
              s.setClipping([...ps.clipping]);
              s.setCropBox(ps.cropBox);
              s.setParallelProjection(ps.camera.parallelProjection);
              s.clearMeasurements();
              for (const mm of ps.measurements) s.addMeasurement(mm);
              if (m.matches && ps.segmentation.labelsRle) {
                session.labels.labels.set(decodeMaskRle(ps.segmentation.labelsRle, session.labels.length));
                for (const o of ps.segmentation.objects) s.addSegment(o);
              }
              if (m.matches && ps.segmentation.visibilityRle) {
                session.visibility.values.set(decodeMaskRle(ps.segmentation.visibilityRle, session.visibility.values.length));
                syncDisplay(session);
              }
              session.engine?.setCameraState(ps.camera);
            } catch (err) {
              s.pushRuntimeIssue({ code: 'INTERNAL', severity: 'error', message: err instanceof Error ? err.message : String(err) });
            }
            e.target.value = '';
          }} />
        <button className="tb-btn" onClick={() => { s.reset(); }} title="Close this study and load another">Close</button>
      </div>
    </div>
  );
}
