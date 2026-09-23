import { useState } from 'react';
import { useAppStore } from '@/state/store';
import { getSession } from '@/state/session';
import { buildSurface } from '@/rendering/surface';
import { suggestBoneThreshold } from '@/segmentation/boneRemoval';
import type { SurfaceLayerState } from '@/state/presentationState';

export function LayersPanel(): JSX.Element {
  const s = useAppStore();
  const session = getSession();
  const [iso, setIso] = useState(() => (s.load ? suggestBoneThreshold(s.load.volume).thresholdHU : 200));
  const [smoothing, setSmoothing] = useState(20);
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const build = (source: SurfaceLayerState['source']) => {
    if (!session?.engine) return;
    setBusy('Extracting surface (marching cubes)…');
    setTimeout(() => {
      try {
        const id = `surf-${Date.now().toString(36)}`;
        const isBinary = source.kind === 'segment';
        const scalars = isBinary
          ? session.labels.binary((source as { labelId: number }).labelId)
          : session.volume.scalars;
        const colour: [number, number, number] = isBinary
          ? (s.segments.find((x) => x.id === (source as { labelId: number }).labelId)?.color as [number, number, number]) ?? [0.9, 0.85, 0.75]
          : [0.92, 0.88, 0.80];
        const res = buildSurface(scalars, session.volume.geometry, {
          isoValue: isBinary ? 0.5 : iso,
          color: colour, opacity: 1, smoothingIterations: smoothing, computeNormals: true,
        });
        session.engine!.attachSurfaceActor(id, res.actor, res.mapper);
        const layer: SurfaceLayerState = {
          id, name: isBinary ? `Surface of segment ${(source as { labelId: number }).labelId}` : `Iso-surface ${iso} HU`,
          isoValue: isBinary ? 0.5 : iso, source, color: colour, opacity: 1, visible: true,
          smoothingIterations: smoothing,
        };
        s.addSurface(layer);
        setInfo(`${res.triangleCount.toLocaleString()} triangles · ${(res.surfaceAreaMm2 / 100).toFixed(1)} cm² surface area`);
      } catch (e) {
        s.pushRuntimeIssue({ code: 'RENDER_FAILED', severity: 'error', message: 'Surface extraction failed.', detail: e instanceof Error ? e.message : String(e) });
      } finally {
        setBusy(null);
      }
    }, 20);
  };

  return (
    <>
      <div className="section">
        <h3>Render mode</h3>
        <div className="list">
          {(['volume', 'surface', 'hybrid'] as const).map((m) => (
            <div key={m} className="list-item" data-active={s.renderMode === m} onClick={() => s.setRenderMode(m)}>
              <span className="name">
                {m === 'volume' ? 'Volume rendering' : m === 'surface' ? 'Surface rendering' : 'Hybrid (volume + surface)'}
              </span>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <label>Show volume</label>
          <input type="checkbox" checked={s.showVolume} onChange={(e) => s.setShowVolume(e.target.checked)} />
        </div>
      </div>

      <div className="section">
        <h3>Surface extraction</h3>
        <div className="row">
          <label>Iso value (HU)</label>
          <input type="number" value={iso} onChange={(e) => setIso(Number(e.target.value))} />
        </div>
        <div className="row">
          <label>Smoothing</label>
          <input type="range" min={0} max={60} step={1} value={smoothing} onChange={(e) => setSmoothing(Number(e.target.value))} />
          <span className="val">{smoothing || 'off'}</span>
        </div>
        <button className="btn wide" disabled={!!busy} onClick={() => build({ kind: 'volume' })}>
          Extract iso-surface from volume
        </button>
        {s.activeSegmentId !== null && (
          <button className="btn wide" style={{ marginTop: 6 }} disabled={!!busy}
            onClick={() => build({ kind: 'segment', labelId: s.activeSegmentId! })}>
            Extract surface of active segment
          </button>
        )}
        {busy && <div className="note" style={{ marginTop: 8 }}>{busy}</div>}
        {info && !busy && <div className="note ok" style={{ marginTop: 8 }}>{info}</div>}
        <div className="hint">
          Surface rendering is a separate mode, not a replacement: a polygonal iso-surface has
          one hard boundary, while volume rendering keeps the full attenuation gradient.
        </div>
      </div>

      <div className="section">
        <h3>Surface layers</h3>
        <div className="list">
          {s.surfaces.length === 0 && <div className="list-item"><span className="name" style={{ color: 'var(--fg-2)' }}>None</span></div>}
          {s.surfaces.map((l) => (
            <div key={l.id} className="list-item">
              <span className="swatch" style={{ background: `rgb(${l.color.map((c) => Math.round(c * 255)).join(',')})` }} />
              <span className="name">{l.name}</span>
              <button className="btn sm" onClick={() => { session?.engine?.removeSurface(l.id); s.removeSurface(l.id); }}>×</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
