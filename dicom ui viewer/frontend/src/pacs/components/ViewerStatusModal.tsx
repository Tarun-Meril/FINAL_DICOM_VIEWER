import React from 'react';
import { RefreshCw, CheckCircle, AlertTriangle, ExternalLink, X } from 'lucide-react';

export interface ViewerStatusModalProps {
  isOpen: boolean;
  status: 'idle' | 'connecting' | 'connected' | 'error';
  viewerUrl: string;
  attemptCount: number;
  onRetry: () => void;
  onClose: () => void;
}

export const ViewerStatusModal: React.FC<ViewerStatusModalProps> = ({
  isOpen,
  status,
  viewerUrl,
  attemptCount,
  onRetry,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        backgroundColor: '#0f172a',
        border: '1px solid #334155',
        borderRadius: '12px',
        padding: '24px',
        width: '100%',
        maxWidth: '440px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        color: '#f8fafc',
      }}>
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
            {status === 'connecting' && <RefreshCw size={18} className="spin-animation" style={{ color: '#38bdf8' }} />}
            {status === 'connected' && <CheckCircle size={18} style={{ color: '#4ade80' }} />}
            {status === 'error' && <AlertTriangle size={18} style={{ color: '#f87171' }} />}
            <span>
              {status === 'connecting' && 'Launching DICOM Viewer...'}
              {status === 'connected' && 'DICOM Viewer Ready'}
              {status === 'error' && 'Viewer Connection Notice'}
            </span>
          </div>
          <button 
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.5' }}>
          {status === 'connecting' && (
            <p>Initializing workspace and loading study slices into viewport...</p>
          )}
          {status === 'error' && (
            <p>The DICOM Viewer process took longer than expected to respond. You can retry or open the study directly.</p>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
          <button
            onClick={onClose}
            className="pacs-btn pacs-btn-outline"
            style={{ padding: '6px 14px' }}
          >
            Dismiss
          </button>
          {status === 'error' && (
            <button
              onClick={onRetry}
              className="pacs-btn pacs-btn-sky"
              style={{ padding: '6px 14px' }}
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
export default ViewerStatusModal;
