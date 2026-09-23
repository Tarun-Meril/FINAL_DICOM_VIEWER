import { useMemo } from 'react';
import VRViewerCore from './VRViewerCore';

/**
 * Route wrapper for the standalone VR page (`/vr?studyUID=…&seriesUID=…`).
 *
 * This file is the ONLY place that knows about URLs and query parameters.
 * It parses them and hands normalised props to the shared VRViewerCore — the
 * same component the main 2D viewer embeds — so route handling never leaks
 * into the validated rendering engine.
 *
 * The legacy `?api=` parameter is honoured so existing standalone VR links keep
 * working unchanged.
 */
export default function StandaloneVRPage() {
  const { studyUID, seriesUID, apiBase } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      studyUID: params.get('studyUID') || params.get('studyUid') || undefined,
      seriesUID: params.get('seriesUID') || params.get('seriesUid') || undefined,
      apiBase: params.get('api') || undefined,
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0a0b0d' }}>
      <VRViewerCore
        studyUID={studyUID}
        seriesUID={seriesUID}
        apiBase={apiBase}
        variant="standalone"
      />
    </div>
  );
}
