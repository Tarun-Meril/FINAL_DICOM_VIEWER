import React, { useState, useEffect } from 'react';
import { MPRWorkspace } from '../../mpr/ui/MPRWorkspace';
import ClinicalServerMPRView from '../../mpr/ui/ClinicalServerMPRView';
import '../../mpr/mpr.css';

import { API_BASE_URL } from '../../config';

export interface MPRViewerCoreProps {
  /** StudyInstanceUID to reconstruct. Never hardcoded. */
  studyUID?: string;
  /** SeriesInstanceUID the host has open. Omit to let the engine choose. */
  seriesUID?: string;
  /** Override the PACS API base; defaults to the app's configured base. */
  apiBase?: string;
  /** Supplied by the 2D viewer so MPR can hand control back. */
  onClose?: () => void;
  /** 'embedded' hides Open Study, since the host owns study selection. */
  variant?: 'embedded' | 'standalone';
}

export default function MPRViewerCore({
  studyUID,
  seriesUID,
  apiBase,
  onClose,
  variant = 'embedded',
}: MPRViewerCoreProps) {
  const activeApiBase = apiBase || API_BASE_URL;
  // Default to native client-side WebGL Cornerstone3D reconstruction engine
  const [engineMode, setEngineMode] = useState<'server' | 'webgl'>('webgl');
  const [hasWebGLError, setHasWebGLError] = useState(false);

  // Monitor for global WebGL context loss to automatically failover to Server MPR
  useEffect(() => {
    const handleContextLost = (e: Event) => {
      console.warn('[MPR] WebGL context loss detected globally — failing over to Server MPR engine');
      setHasWebGLError(true);
      setEngineMode('server');
    };

    window.addEventListener('webglcontextlost', handleContextLost, true);
    return () => {
      window.removeEventListener('webglcontextlost', handleContextLost, true);
    };
  }, []);

  return (
    <div className="merilview-mpr" style={{ width: '100%', height: '100%' }}>
      {engineMode === 'server' && studyUID ? (
        <ClinicalServerMPRView
          studyUID={studyUID}
          seriesUID={seriesUID}
          onClose={onClose}
          onSwitchToWebGL={() => setEngineMode('webgl')}
          hasWebGLError={hasWebGLError}
        />
      ) : (
        <MPRWorkspace
          studyUID={studyUID}
          seriesUID={seriesUID}
          apiBase={activeApiBase}
          onClose={onClose}
          variant={variant}
        />
      )}
    </div>
  );
}
