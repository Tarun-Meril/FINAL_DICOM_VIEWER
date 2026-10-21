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
  // Always default to native client-side WebGL Cornerstone3D reconstruction engine
  const [engineMode, setEngineMode] = useState<'server' | 'webgl'>('webgl');
  const [hasWebGLError, setHasWebGLError] = useState(false);

  // On remote share links (e.g. Netlify), local Python FastAPI server is not present
  const isRemote = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

  return (
    <div className="merilview-mpr" style={{ width: '100%', height: '100%' }}>
      {engineMode === 'server' && studyUID && !isRemote ? (
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
