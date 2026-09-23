import { useRef } from 'react';
import { useAppStore } from '@vr/state/store';
import { HistogramTF } from '../HistogramTF';
import { exportPresets, importPresets } from '@3d/rendering/presets';
import { shiftOpacity, scaleOpacityWidth } from '@3d/rendering/transferFunction';
import { downloadText } from '@vr/utils/download';

export function PresetsPanel(): JSX.Element {
  const s = useAppStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const stats = s.load?.volume.statistics;

  return (
    <>
      <div className="section">
        <h3>Rendering preset</h3>
        <div className="list">
          {s.presets.map((p) => (
            <div key={p.id} className="list-item" data-active={p.id === s.transferFunction.id}
              onClick={() => s.selectPreset(p.id)} title={p.description}>
              <span className="name">{p.name}</span>
              {!p.builtIn && <span className="meta">custom</span>}
            </div>
          ))}
        </div>
        {s.initialPresetReason && <div className="note" style={{ marginTop: 8 }}>{s.initialPresetReason}</div>}
        {s.presetAdaptationNote && <div className="hint">{s.presetAdaptationNote}</div>}
      </div>

      <div className="section">
        <h3>Transfer function</h3>
        {stats && (
          <HistogramTF
            tf={s.transferFunction} histogram={stats.histogram}
            huRange={[Math.max(-1100, stats.min - 50), Math.min(3100, Math.max(stats.max + 50, 1200))]}
            onChange={s.setTransferFunction}
          />
        )}
        <div className="grid2" style={{ marginTop: 6 }}>
          <button className="btn sm" onClick={() => s.setTransferFunction(shiftOpacity(s.transferFunction, -50))}>◀ Shift −50 HU</button>
          <button className="btn sm" onClick={() => s.setTransferFunction(shiftOpacity(s.transferFunction, 50))}>Shift +50 HU ▶</button>
          <button className="btn sm" onClick={() => s.setTransferFunction(scaleOpacityWidth(s.transferFunction, 0.85))}>Narrow ramp</button>
          <button className="btn sm" onClick={() => s.setTransferFunction(scaleOpacityWidth(s.transferFunction, 1.18))}>Widen ramp</button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <label>Interpolation</label>
          <select value={s.transferFunction.interpolation}
            onChange={(e) => s.setTransferFunction({ ...s.transferFunction, interpolation: e.target.value as 'linear' | 'smooth' })}>
            <option value="linear">Linear</option>
            <option value="smooth">Smooth</option>
          </select>
        </div>
      </div>

      <div className="section">
        <h3>Preset management</h3>
        <div className="grid2">
          <button className="btn sm" onClick={s.duplicateActivePreset}>Duplicate</button>
          <button className="btn sm" onClick={s.resetActivePreset} disabled={!s.presets.find((p) => p.id === s.transferFunction.id)?.builtIn}>Reset</button>
          <button className="btn sm" onClick={() => {
            const tf = { ...s.transferFunction, builtIn: false, id: s.transferFunction.builtIn ? `saved-${Date.now().toString(36)}` : s.transferFunction.id };
            s.addPreset(tf);
          }}>Save as…</button>
          <button className="btn sm danger" onClick={() => s.removePreset(s.transferFunction.id)}
            disabled={s.transferFunction.builtIn}>Delete</button>
          <button className="btn sm" onClick={() => downloadText(exportPresets(s.presets.filter((p) => !p.builtIn)), 'medview-presets.json')}>Export…</button>
          <button className="btn sm" onClick={() => fileRef.current?.click()}>Import…</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try { s.importPresetList(importPresets(await f.text())); }
            catch (err) { s.pushRuntimeIssue({ code: 'INTERNAL', severity: 'error', message: err instanceof Error ? err.message : String(err) }); }
            e.target.value = '';
          }} />
      </div>
    </>
  );
}
