import React from 'react';
import { Loader2, AlertCircle, RefreshCw, X } from 'lucide-react';

export interface ViewerStatusModalProps {
  isOpen: boolean;
  status: 'connecting' | 'error';
  viewerUrl: string;
  attemptCount: number;
  maxAttempts: number;
  onRetry: () => void;
  onClose: () => void;
}

export const ViewerStatusModal: React.FC<ViewerStatusModalProps> = ({
  isOpen,
  status,
  viewerUrl,
  attemptCount,
  maxAttempts,
  onRetry,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(5, 7, 10, 0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        style={{
          width: '460px',
          backgroundColor: '#0d111a',
          border: '1px solid #1b2333',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'transparent',
            border: 'none',
            color: '#7e8a9f',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Close"
        >
          <X size={18} />
        </button>

        {status === 'connecting' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(0, 136, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0088ff',
                  flexShrink: 0,
                }}
              >
                <Loader2 size={22} className="spin-animation" style={{ animation: 'spin 1s linear infinite' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                  Connecting to DICOM Viewer...
                </h3>
                <p style={{ fontSize: '12px', color: '#7e8a9f', margin: '2px 0 0 0' }}>
                  Target: <span style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{viewerUrl}</span>
                </p>
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#0f1420',
                border: '1px solid #1b2333',
                borderRadius: '8px',
                padding: '14px',
                fontSize: '13px',
                color: '#94a3b8',
                lineHeight: 1.5,
              }}
            >
              Checking server availability and launching the study viewer...
              <div
                style={{
                  marginTop: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: '#4e5a70',
                }}
              >
                <span>Connection status: Polling</span>
                <span>
                  Attempt {attemptCount} of {maxAttempts}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                onClick={onClose}
                className="pacs-btn"
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  background: '#1e293b',
                  color: '#94a3b8',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ef4444',
                  flexShrink: 0,
                }}
              >
                <AlertCircle size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                  DICOM Viewer Not Reachable
                </h3>
                <p style={{ fontSize: '12px', color: '#7e8a9f', margin: '2px 0 0 0' }}>
                  Target: <span style={{ fontFamily: 'monospace', color: '#ef4444' }}>{viewerUrl}</span>
                </p>
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#0f1420',
                border: '1px solid #1b2333',
                borderRadius: '8px',
                padding: '14px',
                fontSize: '13px',
                color: '#94a3b8',
                lineHeight: 1.5,
              }}
            >
              The DICOM Viewer process is not currently responding on port 5174.
              <div
                style={{
                  marginTop: '8px',
                  padding: '8px 12px',
                  backgroundColor: 'rgba(15, 23, 42, 0.8)',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: '#38bdf8',
                  border: '1px solid #1e293b',
                }}
              >
                npm run dev
              </div>
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#4e5a70' }}>
                Run the command above in your workspace root terminal to launch all services.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  background: '#1e293b',
                  color: '#94a3b8',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={onRetry}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <RefreshCw size={14} />
                Retry Connection
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ViewerStatusModal;
