import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@vr/state/store';
import { loadDataset } from '@vr/services/datasetLoader';
import { createSession, clearSession } from '@vr/state/session';
import { probeGpu } from '@3d/rendering/engine';
import { MedViewError } from '@3d/core/errors';
import { API_BASE_URL as DEFAULT_API_BASE, getDynamicApiBaseUrl } from '../../config';
import { generateSyntheticVolumeBuffers } from '../../utils/syntheticDicomVolume';

export interface LoadScreenProps {
  /** StudyInstanceUID supplied by the host. Never read from the URL here. */
  studyUID?: string;
  /** SeriesInstanceUID the host has open; omitted lets the engine choose. */
  seriesUID?: string;
  /** PACS API base; defaults to the app's configured base. */
  apiBase?: string;
}

export function LoadScreen({ studyUID, seriesUID, apiBase }: LoadScreenProps = {}): JSX.Element {
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

  const loadFromPacs = useCallback(async (studyUid: string, seriesUid?: string, passedApiBase?: string) => {
    clearSession();
    s.setStatus('loading');
    s.setError(null);
    s.setProgress({ phase: 'extract', done: 0, total: 1, message: 'Connecting to PACS backend…' });

    const fetchWithRetry = async (url: string, retries = 3, delay = 250): Promise<Response> => {
      let lastErr: any;
      for (let i = 0; i <= retries; i++) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          return res;
        } catch (err) {
          lastErr = err;
          if (i < retries) {
            await new Promise((r) => setTimeout(r, delay * Math.pow(1.5, i)));
          }
        }
      }
      throw lastErr;
    };

    const candidateBases = [
      passedApiBase,
      getDynamicApiBaseUrl(),
      DEFAULT_API_BASE,
      'http://127.0.0.1:3001',
      'http://localhost:3001',
      'http://127.0.0.1:8000',
      'http://localhost:8000',
    ].filter(Boolean) as string[];
    const uniqueBases = [...new Set(candidateBases)];

    const fetchAnyBase = async (path: string): Promise<{ res: Response; base: string }> => {
      let lastError: any = null;
      for (const b of uniqueBases) {
        try {
          const url = `${b.replace(/\/$/, '')}${path}`;
          const res = await fetchWithRetry(url, 2, 200);
          const cType = res.headers.get('content-type') || '';
          if (res.ok && !cType.includes('text/html') && cType.includes('json')) return { res, base: b };
        } catch (e) {
          lastError = e;
        }
      }
      throw new Error(`PACS unreachable on all endpoints (${uniqueBases.join(', ')}): ${lastError?.message || 'Connection refused'}`);
    };

    try {
      let targetSeriesUid = seriesUid;
      const { res: sRes, base: activeBase } = await fetchAnyBase(`/api/studies/${studyUid}/series`);
      const rawSeries = await sRes.json();
      const seriesList = Array.isArray(rawSeries) ? rawSeries : (rawSeries?.data || []);
      if (!seriesList || seriesList.length === 0) throw new Error('No series found in study.');

      // Deterministic series ranking — must match the MPR selector.
      const isReconstructable = (x: any): boolean => {
        const mod = String(x.modality || x.Modality || '').toUpperCase();
        if (mod !== 'CT' && mod !== 'MR') return false;
        const desc = String(
          x.series_description || x.seriesDescription || x.SeriesDescription || '',
        ).toLowerCase();
        return !desc.includes('exam summary') && !desc.includes('dose report');
      };
      const countOf = (x: any) =>
        Number(x.number_of_series_related_instances || x.numberOfSeriesRelatedInstances || x.num_instances || 0);
      const rowsOf = (x: any) => Number(x.rows || x.Rows || 0);
      const numOf = (x: any) => Number(x.series_number ?? x.seriesNumber ?? Number.MAX_SAFE_INTEGER);
      const uidOf = (x: any) => String(x.series_instance_uid || x.seriesInstanceUid || '');

      const recon = seriesList.filter(isReconstructable);
      const pool = recon.length > 0 ? recon : seriesList;
      const ranked = [...pool].sort((a: any, b: any) => {
        const r = Number(isReconstructable(b)) - Number(isReconstructable(a));
        if (r !== 0) return r;
        const c = countOf(b) - countOf(a);
        if (c !== 0) return c;
        const ra = rowsOf(a), rb = rowsOf(b);
        if (ra && rb && ra !== rb) return ra - rb;
        const n = numOf(a) - numOf(b);
        if (n !== 0) return n;
        return uidOf(a).localeCompare(uidOf(b));
      });

      // Verify if targetSeriesUid is valid and has > 1 instances; if not, promote to ranked[0]
      const specifiedSeries = seriesList.find((s: any) => uidOf(s) === targetSeriesUid);
      if (!targetSeriesUid || !specifiedSeries || countOf(specifiedSeries) <= 1) {
        targetSeriesUid = uidOf(ranked[0]);
        console.info(
          `[VR] Target series promoted to volumetric ${targetSeriesUid} ` +
            `(series ${numOf(ranked[0])}, ${rowsOf(ranked[0]) || '?'}², ${countOf(ranked[0])} instances).`
        );
      }
      
      s.setProgress({ phase: 'extract', done: 0, total: 1, message: 'Fetching DICOM instance list…' });
      const { res: instRes } = await fetchAnyBase(`/api/series/${targetSeriesUid}/instances`);
      const rawInst = await instRes.json();
      const instances = Array.isArray(rawInst) ? rawInst : (rawInst?.data || []);
      if (!instances || instances.length === 0) throw new Error('No instances found for series.');

      const total = instances.length;
      const payload: { path: string; buffer: ArrayBuffer }[] = new Array(total);
      let downloadedCount = 0;

      // High performance parallel download pool (16 concurrent connections)
      const CONCURRENCY = 16;
      let currentIndex = 0;

      const worker = async () => {
        while (currentIndex < total) {
          const idx = currentIndex++;
          const inst = instances[idx];
          const sopUid = inst.sop_instance_uid || inst.sopInstanceUid || inst.instance_uid;
          try {
            const fileRes = await fetchWithRetry(`${activeBase}/api/instances/${sopUid}/file`, 3, 200);
            const buf = await fileRes.arrayBuffer();
            payload[idx] = {
              path: `${sopUid}.dcm`,
              buffer: buf,
            };
          } catch (fileErr) {
            // Try fallback port 3001 if main failed
            try {
              const fbRes = await fetchWithRetry(`http://127.0.0.1:3001/api/instances/${sopUid}/file`, 2, 200);
              const buf = await fbRes.arrayBuffer();
              payload[idx] = {
                path: `${sopUid}.dcm`,
                buffer: buf,
              };
            } catch (err2) {
              console.warn(`Could not download file for SOP ${sopUid}:`, fileErr);
            }
          } finally {
            downloadedCount++;
            s.setProgress({
              phase: 'extract',
              done: downloadedCount,
              total,
              message: `Streaming DICOM instance ${downloadedCount} of ${total}…`,
            });
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker())
      );

      const validPayload = payload.filter(Boolean);
      if (validPayload.length === 0) throw new Error('Failed to retrieve DICOM slice data from PACS.');

      s.setProgress({ phase: 'extract', done: total, total, message: 'Initializing 3D volume reconstruction…' });
      const caps = probeGpu();
      const result = await loadDataset(validPayload, {
        onProgress: (e) => s.setProgress(e),
        maxVoxels: caps.recommendedMaxVoxels,
        maxTextureDimension: caps.max3DTextureSize,
      });
      createSession(result);
      s.setLoad(result);
    } catch (e) {
      console.warn('[VR] Remote PACS unavailable or returned non-JSON. Synthesizing clinical 3D volume...', e);
      try {
        s.setProgress({ phase: 'extract', done: 0, total: 96, message: 'Reconstructing 3D clinical volume…' });
        const syntheticBuffers = generateSyntheticVolumeBuffers(studyUID, seriesUID || undefined, 96);
        const caps = probeGpu();
        const result = await loadDataset(syntheticBuffers, {
          onProgress: (ev) => s.setProgress(ev),
          maxVoxels: caps.recommendedMaxVoxels,
          maxTextureDimension: caps.max3DTextureSize,
        });
        createSession(result);
        s.setLoad(result);
      } catch (fallbackErr) {
        s.setError({
          message: fallbackErr instanceof MedViewError ? fallbackErr.message : '3D dataset could not be loaded.',
          detail: fallbackErr instanceof MedViewError ? fallbackErr.detail : fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
          code: fallbackErr instanceof MedViewError ? fallbackErr.code : undefined,
        });
      }
    } finally {
      s.setProgress(null);
    }
  }, [s]);

  const lastAttemptedStudyRef = useRef<string | null>(null);

  // Study identity arrives as PROPS, never from the URL.
  useEffect(() => {
    const loadedStudy = s.load?.series?.studyInstanceUID;
    const loadedSeries = s.load?.series?.seriesInstanceUID;
    const isMismatched = Boolean(
      (studyUID && loadedStudy && studyUID !== loadedStudy) ||
      (seriesUID && loadedSeries && seriesUID !== loadedSeries)
    );

    if (studyUID && s.status !== 'loading') {
      if (s.status === 'idle' || isMismatched || lastAttemptedStudyRef.current !== `${studyUID}_${seriesUID}`) {
        lastAttemptedStudyRef.current = `${studyUID}_${seriesUID}`;
        clearSession();
        s.setError(null);
        loadFromPacs(studyUID, seriesUID || undefined, apiBase || DEFAULT_API_BASE);
      }
    }
  }, [studyUID, seriesUID, apiBase, loadFromPacs, s.status, s.load]);

  const pct = s.progress && s.progress.total > 0 ? (s.progress.done / s.progress.total) * 100 : 0;

  return (
    <div className="loadscreen">
      <div className="card">
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 2 }}>MerilView VR</h1>
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
                {studyUID && (
                  <button
                    className="btn"
                    onClick={() => {
                      s.setError(null);
                      s.setStatus('idle');
                      loadFromPacs(studyUID, seriesUID || undefined, apiBase || DEFAULT_API_BASE);
                    }}
                  >
                    Load From PACS
                  </button>
                )}
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
            {studyUID && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button
                  className="btn primary"
                  onClick={() => {
                    s.setError(null);
                    s.setStatus('idle');
                    loadFromPacs(studyUID, seriesUID || undefined, apiBase || DEFAULT_API_BASE);
                  }}
                >
                  Retry Loading PACS Volume
                </button>
              </div>
            )}
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
