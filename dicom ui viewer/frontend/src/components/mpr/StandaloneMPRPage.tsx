import { useMemo } from 'react';
import MPRViewerCore from './MPRViewerCore';

/**
 * Route wrapper for the standalone MPR page (`/mpr?studyUID=…&seriesUID=…`).
 *
 * This file is the ONLY place that knows about URLs and query parameters.
 * It parses them and hands normalised props to the shared MPRViewerCore — the
 * same component the main 2D viewer embeds — so route handling never leaks
 * into the validated engine.
 *
 * The legacy `?api=` parameter is honoured so existing standalone MPR links
 * keep working unchanged.
 */
export default function StandaloneMPRPage() {
  const { studyUID, seriesUID, apiBase } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      studyUID: params.get('studyUID') || params.get('studyUid') || undefined,
      seriesUID: params.get('seriesUID') || params.get('seriesUid') || undefined,
      apiBase: params.get('api') || undefined,
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}>
      <MPRViewerCore
        studyUID={studyUID}
        seriesUID={seriesUID}
        apiBase={apiBase}
        variant="standalone"
      />
    </div>
  );
}
