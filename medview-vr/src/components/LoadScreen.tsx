import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/state/store';
import { loadDataset } from '@/services/datasetLoader';
import { createSession, clearSession } from '@/state/session';
import { probeGpu } from '@/rendering/engine';
import { MedViewError } from '@/core/errors';

export function LoadScreen(): JSX.Element {
  const s = useAppStore();
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);

  const start = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    clearSession();
    s.setStatus('loading');
    s.setError(null);
    s.setProgress({ phase: 'extract', done: 0, total: files.length, message: 'Reading files…' });
    try {
      const caps = probeGpu();
      const payload = await Promise.all(files.map(async (f) => ({
        path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
        buffer: await f.arrayBuffer(),
      })));
      const result = await loadDataset(payload, {
        onProgress: (e) => s.setProgress(e),
        maxVoxels: caps.recommendedMaxVoxels,
        maxTextureDimension: caps.max3DTextureSize,
      });
      createSession(result);
      s.setLoad(result);
    } catch (e) {
      s.setError({
        message: e instanceof MedViewError ? e.message : 'The dataset could not be loaded.',
        detail: e instanceof MedViewError ? e.detail : e instanceof Error ? e.message : String(e),
        code: e instanceof MedViewError ? e.code : undefined,
      });
    } finally {
      s.setProgress(null);
    }
  }, [s]);

  const loadFromPacs = useCallback(async (studyUid: string, seriesUid?: string, apiBase = 'http://localhost:8000') => {
    clearSession();
    s.setStatus('loading');
    s.setError(null);
    s.setProgress({ phase: 'extract', done: 0, total: 1, message: 'Connecting to PACS backend…' });
    try {
      let targetSeriesUid = seriesUid;
      if (!targetSeriesUid) {
        const sRes = await fetch(`${apiBase}/api/studies/${studyUid}/series`);
        if (!sRes.ok) throw new Error(`Failed to fetch series for study: ${sRes.statusText}`);
        const seriesList = await sRes.json();
        if (!seriesList || seriesList.length === 0) throw new Error('No series found in study.');
        const ctSeries = seriesList.find((sr: any) => sr.modality === 'CT') || seriesList[0];
        targetSeriesUid = ctSeries.series_instance_uid || ctSeries.seriesInstanceUid;
      }
      
      s.setProgress({ phase: 'extract', done: 0, total: 1, message: 'Fetching DICOM instance list…' });
      const instRes = await fetch(`${apiBase}/api/series/${targetSeriesUid}/instances`);
      if (!instRes.ok) throw new Error(`Failed to fetch instances: ${instRes.statusText}`);
      const instances = await instRes.json();
      if (!instances || instances.length === 0) throw new Error('No instances found for series.');

      const total = instances.length;
      const payload: { path: string; buffer: ArrayBuffer }[] = [];
      
      for (let i = 0; i < total; i++) {
        const inst = instances[i];
        const sopUid = inst.sop_instance_uid || inst.sopInstanceUid || inst.instance_uid;
        s.setProgress({ 
          phase: 'extract', 
          done: i, 
          total, 
          message: `Streaming DICOM instance ${i + 1} of ${total}…` 
        });
        const fileRes = await fetch(`${apiBase}/api/instances/${sopUid}/file`);
        if (!fileRes.ok) {
          console.warn(`Could not download file for SOP ${sopUid}`);
          continue;
        }
        const buf = await fileRes.arrayBuffer();
        payload.push({
          path: `${sopUid}.dcm`,
          buffer: buf,
        });
      }

      if (payload.length === 0) throw new Error('Failed to retrieve DICOM slice data from PACS.');

      s.setProgress({ phase: 'extract', done: total, total, message: 'Initializing 3D volume reconstruction…' });
      const caps = probeGpu();
      const result = await loadDataset(payload, {
        onProgress: (e) => s.setProgress(e),
        maxVoxels: caps.recommendedMaxVoxels,
        maxTextureDimension: caps.max3DTextureSize,
      });
      createSession(result);
      s.setLoad(result);
    } catch (e) {
      s.setError({
        message: e instanceof MedViewError ? e.message : 'PACS dataset could not be loaded.',
        detail: e instanceof MedViewError ? e.detail : e instanceof Error ? e.message : String(e),
        code: e instanceof MedViewError ? e.code : undefined,
      });
    } finally {
      s.setProgress(null);
    }
  }, [s]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const studyUid = params.get('studyUID') || params.get('studyUid');
    const seriesUid = params.get('seriesUID') || params.get('seriesUid');
    const apiBase = params.get('api') || 'http://localhost:8000';
    if (studyUid && s.status === 'idle') {
      loadFromPacs(studyUid, seriesUid || undefined, apiBase);
    }
  }, [loadFromPacs, s.status]);

  const pct = s.progress && s.progress.total > 0 ? (s.progress.done / s.progress.total) * 100 : 0;

  return (
    <div className="loadscreen">
      <div className="card">
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 2 }}>MedView VR</h1>
        <p style={{ color: 'var(--fg-2)', marginTop: 0, marginBottom: 20 }}>
          Standalone CT 3D volume visualisation engine — R&amp;D prototype
        </p>

        <div className="dropzone" data-over={over}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={async (e) => {
            e.preventDefault(); setOver(false);
            const files = [...e.dataTransfer.files];
            await start(files);
          }}>
          {s.status === 'loading' ? (
            <>
              <div style={{ fontSize: 14 }}>{s.progress?.message ?? 'Loading…'}</div>
              <div className="bar"><i style={{ width: `${pct}%` }} /></div>
              <div className="hint" style={{ marginTop: 10 }}>
                Decoding runs in background workers, so this window stays responsive.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 15, marginBottom: 6 }}>Drop a CT study here</div>
              <div className="hint">
                A ZIP / TAR / TAR.GZ archive, a folder of DICOM files, or loose files.
                Filenames and extensions are ignored — every file is inspected.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                <button className="btn primary" onClick={() => inputRef.current?.click()}>Choose files…</button>
                <button className="btn" onClick={() => dirRef.current?.click()}>Choose folder…</button>
              </div>
            </>
          )}
        </div>

        <input ref={inputRef} type="file" multiple style={{ display: 'none' }}
          onChange={(e) => start([...(e.target.files ?? [])])} />
        <input ref={dirRef} type="file" multiple style={{ display: 'none' }}
          // @ts-expect-error non-standard but supported in Chromium/Firefox/Safari
          webkitdirectory="" directory=""
          onChange={(e) => start([...(e.target.files ?? [])])} />

        {s.error && (
          <div className="note error" style={{ marginTop: 16 }}>
            <b>{s.error.message}</b>
            {s.error.detail && <div style={{ marginTop: 6, color: 'var(--fg-2)', fontSize: 10, fontFamily: 'var(--mono)' }}>{s.error.detail}</div>}
            {s.error.code && <div style={{ marginTop: 4, color: 'var(--fg-2)', fontSize: 10 }}>code: {s.error.code}</div>}
          </div>
        )}

        <div className="note" style={{ marginTop: 20 }}>
          <b>Data stays on this machine.</b> DICOM files are read in the browser and are never
          uploaded, transmitted to any service, or written to a server.
        </div>
      </div>
    </div>
  );
}
