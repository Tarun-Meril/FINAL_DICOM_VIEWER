import { useState } from 'react';
import { useAppStore } from '@/state/store';
import { getSession, syncDisplay } from '@/state/session';
import { thresholdSegment, filterConnectedComponents, applyLabelToVisibility } from '@/segmentation/operations';
import { extractBone, suggestBoneThreshold } from '@/segmentation/boneRemoval';
import { formatVolume } from '@/measurement/measurements';
import type { SegmentationObject } from '@/segmentation/types';

const PALETTE: Array<[number, number, number]> = [
  [0.91, 0.30, 0.24], [0.20, 0.60, 0.86], [0.95, 0.77, 0.06], [0.18, 0.80, 0.44],
  [0.61, 0.35, 0.71], [0.90, 0.49, 0.13], [0.10, 0.74, 0.61], [0.85, 0.85, 0.85],
];

export function SegmentPanel(): JSX.Element {
  const s = useAppStore();
  const session = getSession();
  const [lower, setLower] = useState(200);
  const [upper, setUpper] = useState(3071);
  const [minComponent, setMinComponent] = useState(200);
  const [keepLargest, setKeepLargest] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const suggestion = s.load ? suggestBoneThreshold(s.load.volume) : null;

  const refreshHistory = () => {
    if (!session) return;
    s.setHistoryState(session.history.canUndo(), session.history.canRedo(), session.history.labels());
  };

  const nextLabelId = (): number => {
    const used = new Set(s.segments.map((x) => x.id));
    for (let i = 1; i < 255; i++) if (!used.has(i)) return i;
    return 255;
  };

  const createSegment = (name: string, origin: SegmentationObject['origin'], parameters?: Record<string, unknown>): SegmentationObject => {
    const id = nextLabelId();
    const seg: SegmentationObject = {
      id, name, color: PALETTE[(id - 1) % PALETTE.length], opacity: 0.7, visible: true,
      origin, createdAt: Date.now(), parameters,
    };
    s.addSegment(seg);
    return seg;
  };

  const runThreshold = () => {
    if (!session) return;
    setBusy('Thresholding…');
    setTimeout(() => {
      const seg = s.activeSegmentId !== null
        ? s.segments.find((x) => x.id === s.activeSegmentId)! 
        : createSegment(`Threshold ${lower}…${upper} HU`, 'threshold', { lower, upper });
      const delta = thresholdSegment(session.volume, session.labels, seg.id, {
        lower, upper, withinVisible: session.masked ? session.visibility.values : undefined,
      });
      session.history.push({ delta, target: 'labels', at: Date.now() });
      const st = session.labels.stats(seg.id, session.volume);
      s.setSegmentStats(seg.id, { voxelCount: st.voxelCount, volumeMm3: st.volumeMm3 });
      setLastResult(`${st.voxelCount.toLocaleString()} voxels (${formatVolume(st.volumeMm3)})`);
      refreshHistory();
      setBusy(null);
    }, 20);
  };

  const runComponents = () => {
    if (!session || s.activeSegmentId === null) return;
    setBusy('Filtering connected components…');
    setTimeout(() => {
      const { delta, components } = filterConnectedComponents(session.labels, s.activeSegmentId!, (c, all) => {
        if (c.size < minComponent) return false;
        if (keepLargest > 0) {
          const ranked = [...all].sort((a, b) => b.size - a.size).slice(0, keepLargest);
          return ranked.some((r) => r.componentId === c.componentId);
        }
        return true;
      });
      session.history.push({ delta, target: 'labels', at: Date.now() });
      const st = session.labels.stats(s.activeSegmentId!, session.volume);
      s.setSegmentStats(s.activeSegmentId!, { voxelCount: st.voxelCount, volumeMm3: st.volumeMm3 });
      setLastResult(`${components.length} components found, ${st.voxelCount.toLocaleString()} voxels kept`);
      refreshHistory();
      setBusy(null);
    }, 20);
  };

  const runBone = (mode: 'extract' | 'remove' | 'keep') => {
    if (!session) return;
    setBusy(mode === 'extract' ? 'Extracting bone…' : mode === 'remove' ? 'Removing bone…' : 'Isolating bone…');
    setTimeout(() => {
      let seg = s.segments.find((x) => x.origin === 'threshold' && x.name.startsWith('Bone'));
      if (!seg) seg = createSegment(`Bone ≥ ${lower} HU`, 'threshold', { thresholdHU: lower, minComponentVoxels: minComponent });
      const res = extractBone(session.volume, session.labels, seg.id, {
        thresholdHU: lower, minComponentVoxels: minComponent, keepLargest,
        dilateVoxels: mode === 'remove' ? 1 : 0,
        withinVisible: session.masked ? session.visibility.values : undefined,
      });
      for (const d of res.deltas) session.history.push({ delta: d, target: 'labels', at: Date.now() });
      if (mode !== 'extract') {
        const d = applyLabelToVisibility(session.visibility.values, session.labels, seg.id, mode === 'remove' ? 'erase' : 'keep');
        session.history.push({ delta: d, target: 'visibility', at: Date.now() });
        syncDisplay(session);
      }
      const st = session.labels.stats(seg.id, session.volume);
      s.setSegmentStats(seg.id, { voxelCount: st.voxelCount, volumeMm3: st.volumeMm3 });
      setLastResult(`${res.componentCount || '—'} components, ${st.voxelCount.toLocaleString()} voxels (${formatVolume(st.volumeMm3)})`);
      refreshHistory();
      setBusy(null);
    }, 20);
  };

  return (
    <>
      <div className="section">
        <h3>Segmentation objects</h3>
        <div className="list">
          {s.segments.length === 0 && <div className="list-item"><span className="name" style={{ color: 'var(--fg-2)' }}>None yet</span></div>}
          {s.segments.map((seg) => (
            <div key={seg.id} className="list-item" data-active={seg.id === s.activeSegmentId}
              onClick={() => s.setActiveSegment(seg.id)}>
              <span className="swatch" style={{ background: `rgb(${seg.color.map((c) => Math.round(c * 255)).join(',')})` }} />
              <span className="name">{seg.name}</span>
              <span className="meta">{s.segmentStats[seg.id] ? formatVolume(s.segmentStats[seg.id].volumeMm3) : '—'}</span>
              <button className="btn sm" onClick={(e) => { e.stopPropagation(); s.removeSegment(seg.id); session?.labels.clearLabel(seg.id); }}>×</button>
            </div>
          ))}
        </div>
        <div className="grid2" style={{ marginTop: 6 }}>
          <button className="btn sm" onClick={() => createSegment(`Segment ${s.segments.length + 1}`, 'manual')}>New object</button>
          <button className="btn sm" disabled={s.activeSegmentId === null}
            onClick={() => {
              if (!session || s.activeSegmentId === null) return;
              session.labels.clearLabel(s.activeSegmentId);
              s.setSegmentStats(s.activeSegmentId, { voxelCount: 0, volumeMm3: 0 });
            }}>Clear object</button>
        </div>
      </div>

      <div className="section">
        <h3>Threshold segmentation</h3>
        <div className="row">
          <label>Lower (HU)</label>
          <input type="number" value={lower} onChange={(e) => setLower(Number(e.target.value))} />
        </div>
        <div className="row">
          <label>Upper (HU)</label>
          <input type="number" value={upper} onChange={(e) => setUpper(Number(e.target.value))} />
        </div>
        {suggestion && (
          <div className="note" style={{ marginBottom: 8 }}>
            Suggested dense-material threshold for <em>this dataset</em>: <b>{suggestion.thresholdHU} HU</b>.{' '}
            {suggestion.rationale}{' '}
            <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setLower(suggestion.thresholdHU)}>Use it</button>
          </div>
        )}
        <button className="btn wide" onClick={runThreshold} disabled={!!busy}>Apply threshold</button>
      </div>

      <div className="section">
        <h3>Connected components</h3>
        <div className="row">
          <label>Min voxels</label>
          <input type="number" value={minComponent} onChange={(e) => setMinComponent(Number(e.target.value))} />
        </div>
        <div className="row">
          <label>Keep largest</label>
          <input type="number" min={0} value={keepLargest} onChange={(e) => setKeepLargest(Number(e.target.value))} />
          <span className="val">{keepLargest === 0 ? 'all' : ''}</span>
        </div>
        <button className="btn wide" onClick={runComponents} disabled={!!busy || s.activeSegmentId === null}>
          Filter components of active object
        </button>
      </div>

      <div className="section">
        <h3>Bone workflow</h3>
        <div className="grid2">
          <button className="btn sm" onClick={() => runBone('extract')} disabled={!!busy}>Extract bone</button>
          <button className="btn sm" onClick={() => runBone('keep')} disabled={!!busy}>Keep bone only</button>
          <button className="btn sm" onClick={() => runBone('remove')} disabled={!!busy}>Remove bone</button>
          <button className="btn sm" disabled={!!busy || s.activeSegmentId === null}
            onClick={() => {
              if (!session || s.activeSegmentId === null) return;
              const d = applyLabelToVisibility(session.visibility.values, session.labels, s.activeSegmentId, 'keep');
              session.history.push({ delta: d, target: 'visibility', at: Date.now() });
              syncDisplay(session); refreshHistory();
            }}>Isolate object</button>
        </div>
        <div className="hint">
          Bone removal hides voxels; it never edits the DICOM. Undo, or “Restore full volume”
          in the Clip panel, brings everything back.
        </div>
        <div className="note warn">
          Thresholding separates attenuation ranges, not anatomy. Dense contrast, metal and
          calcification fall in the same range as bone and will be affected too.
        </div>
      </div>

      {busy && <div className="note">{busy}</div>}
      {lastResult && !busy && <div className="note ok">{lastResult}</div>}
    </>
  );
}
