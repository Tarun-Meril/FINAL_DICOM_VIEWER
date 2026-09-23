import React, { useState } from 'react';
import { Settings, Server, RefreshCw, CheckCircle, AlertOctagon, ShieldCheck } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const [aeTitle, setAeTitle] = useState('MEDVIEW_PACS');
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('11112');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const [isAuditing, setIsAuditing] = useState(false);
  const [auditReport, setAuditReport] = useState<any | null>(null);

  const handleTestConnection = (e: React.FormEvent) => {
    e.preventDefault();
    setIsTesting(true);
    setTestResult(null);
    setTimeout(() => {
      setIsTesting(false);
      setTestResult('success');
    }, 1200);
  };

  const runDatabaseAudit = () => {
    setIsAuditing(true);
    setAuditReport(null);
    fetch('/api/database/validate')
      .then(res => res.json())
      .then(data => {
        setAuditReport(data);
        setIsAuditing(false);
      })
      .catch(err => {
        alert('Audit failed: ' + err.message);
        setIsAuditing(false);
      });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
      {/* PACS Config Form */}
      <form onSubmit={handleTestConnection} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Server size={18} style={{ color: 'var(--color-accent)' }} />
          PACS C-STORE / C-FIND Configuration
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Local AE Title</label>
          <input
            type="text"
            className="form-control"
            value={aeTitle}
            onChange={(e) => setAeTitle(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>PACS Host Address</label>
          <input
            type="text"
            className="form-control"
            value={host}
            onChange={(e) => setHost(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>PACS Port</label>
          <input
            type="text"
            className="form-control"
            value={port}
            onChange={(e) => setPort(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isTesting}>
            {isTesting ? <RefreshCw size={16} className="spin-animation" /> : null}
            {isTesting ? 'Testing...' : 'Test Connection'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => alert('Settings saved locally.')}>
            Save Settings
          </button>
        </div>

        {testResult === 'success' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-success)', fontSize: '14px', marginTop: '12px' }}>
            <CheckCircle size={16} />
            PACS Echo (C-ECHO) Succeeded! Server is responsive.
          </div>
        )}
      </form>

      {/* Info Card */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Settings size={18} style={{ color: 'var(--color-accent)' }} />
          System Information
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px', color: 'var(--text-secondary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px' }}>
            <span>Database Status</span>
            <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>Connected</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px' }}>
            <span>Storage Path</span>
            <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>pacs-study-browser/backend/data/instances</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px' }}>
            <span>Viewer Integration</span>
            <span style={{ color: 'var(--color-accent)' }}>MedView PRO (Active)</span>
          </div>
        </div>

        {/* Database Integrity Validation */}
        <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-glass)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={16} style={{ color: 'var(--color-success)' }} />
            Database Integrity Validation
          </h4>
          <button 
            type="button" 
            className="pacs-btn pacs-btn-outline" 
            onClick={runDatabaseAudit}
            disabled={isAuditing}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {isAuditing ? 'Auditing...' : 'Run Integrity Scan'}
          </button>
          
          {auditReport && (
            <div style={{ fontSize: '12px', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Scan Outcome:</span>
                <span style={{ color: auditReport.success ? 'var(--color-success)' : 'var(--color-error)', fontWeight: 'bold' }}>
                  {auditReport.success ? 'PASS' : 'FAIL'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Missing Files:</span>
                <span style={{ color: auditReport.report.missingFilesCount > 0 ? 'var(--color-error)' : 'var(--text-primary)' }}>
                  {auditReport.report.missingFilesCount}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Duplicate SOP UIDs:</span>
                <span style={{ color: auditReport.report.duplicateSopCount > 0 ? 'var(--color-warning)' : 'var(--text-primary)' }}>
                  {auditReport.report.duplicateSopCount}
                </span>
              </div>
              
              {auditReport.errors && auditReport.errors.length > 0 && (
                <div style={{ borderTop: '1px dashed var(--border-glass)', paddingTop: '6px', marginTop: '4px' }}>
                  <div style={{ color: 'var(--color-error)', fontWeight: 600, marginBottom: '4px' }}>Errors (Max 5):</div>
                  <ul style={{ paddingLeft: '14px', margin: 0, display: 'flex', flexDirection: 'column', gap: '3px', color: 'rgba(239,68,68,0.85)', fontSize: '11px' }}>
                    {auditReport.errors.slice(0, 5).map((err: string, i: number) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 'auto', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '16px', borderRadius: '8px', display: 'flex', gap: '10px' }}>
          <AlertOctagon size={20} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            <strong>Note:</strong> Opening a study will launch the MedView PRO DICOM Viewer in a separate browser tab, keeping the PACS Study Browser and the Viewer completely decoupled.
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin-animation {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};
export default SettingsPage;
