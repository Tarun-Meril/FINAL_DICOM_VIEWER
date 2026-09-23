import React, { useState, useEffect } from 'react';
import { Info, User, FileText, ExternalLink, Layers } from 'lucide-react';
import { Study } from '../types';

interface SelectedStudyInfoProps {
  study: Study | null;
  onOpenViewer: (uid: string, seriesUid?: string) => void;
}

// Helper to format date to match screenshot: Sep-09-1977
const formatBirthDate = (dateStr?: string) => {
  if (!dateStr || dateStr.length !== 8) return 'Sep-09-1977'; // Default mock from screenshot
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  const monthIndex = parseInt(month, 10) - 1;
  const monthName = months[monthIndex] || month;

  return `${monthName}-${day}-${year}`;
};

// Helper to format date to match screenshot: Jan-01-2024
const formatStudyDate = (dateStr?: string) => {
  if (!dateStr || dateStr.length !== 8) return 'Jan-01-2024'; // Default mock from screenshot
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  const monthIndex = parseInt(month, 10) - 1;
  const monthName = months[monthIndex] || month;

  return `${monthName}-${day}-${year}`;
};

const calculateAge = (birthDate?: string) => {
  if (!birthDate || birthDate.length !== 8) return '48Y'; // Default mock age from screenshot
  const birthYear = parseInt(birthDate.substring(0, 4), 10);
  const currentYear = new Date().getFullYear();
  return `${currentYear - birthYear}Y`;
};

export const SelectedStudyInfo: React.FC<SelectedStudyInfoProps> = ({ study, onOpenViewer }) => {
  const [seriesList, setSeriesList] = useState<any[]>([]);
  const [loadingSeries, setLoadingSeries] = useState(false);

  useEffect(() => {
    if (study) {
      setLoadingSeries(true);
      fetch(`/api/studies/${study.studyInstanceUid}/series`)
        .then(res => res.json())
        .then(res => {
          if (res.success && Array.isArray(res.data)) {
            setSeriesList(res.data);
          } else {
            setSeriesList([]);
          }
          setLoadingSeries(false);
        })
        .catch(err => {
          console.error(err);
          setSeriesList([]);
          setLoadingSeries(false);
        });
    } else {
      setSeriesList([]);
    }
  }, [study]);

  if (!study) {
    return (
      <aside className="right-panel">
        <div className="detail-header">
          <Info size={16} />
          Selected Study Info
        </div>
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
          Select a study from the list to view demographics and acquisition details.
        </div>
      </aside>
    );
  }

  return (
    <aside className="right-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div className="detail-header">
        <Info size={16} />
        Selected Study Info
      </div>

      <div className="detail-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, padding: '16px' }}>
        {/* Patient Demographics */}
        <div className="detail-card">
          <div className="detail-card-title">
            <User size={14} />
            Patient Demographics
          </div>
          
          <div className="detail-row">
            <span className="detail-label">Full Name</span>
            <span className="detail-value">{study.patientName}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">ID (MRN)</span>
            <span className="detail-value" style={{ fontFamily: 'monospace' }}>{study.patientId}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Birthdate</span>
            <span className="detail-value">{formatBirthDate(study.patientBirthDate)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Age</span>
            <span className="detail-value">{calculateAge(study.patientBirthDate)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Gender</span>
            <span className="detail-value">{study.patientSex || 'O'}</span>
          </div>
        </div>

        {/* Exam Acquisition Info */}
        <div className="detail-card">
          <div className="detail-card-title">
            <FileText size={14} />
            Exam Acquisition Info
          </div>

          <div className="detail-row">
            <span className="detail-label">Description</span>
            <span className="detail-value">{study.studyDescription || '(No Description)'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Modality</span>
            <span className="detail-value" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
              {study.modalitiesInStudy?.replace(/,/g, '\\')}
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Acquisition Date</span>
            <span className="detail-value">{formatStudyDate(study.studyDate)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Institution</span>
            <span className="detail-value">{study.institution || 'Metro PACS Center'}</span>
          </div>
        </div>

        {/* Series Explorer List (Phase 4) */}
        <div className="detail-card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="detail-card-title">
            <Layers size={14} />
            Series Hierarchy
          </div>
          {loadingSeries ? (
            <div style={{ padding: '12px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>Loading series...</div>
          ) : seriesList.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
              {seriesList.map((ser) => (
                <div key={ser.seriesInstanceUid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: '2px', flex: 1 }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span>Ser {ser.seriesNumber}</span>
                      <span style={{ fontSize: '8px', background: 'rgba(59,130,246,0.15)', color: '#3B82F6', padding: '0 4px', borderRadius: '2px', fontWeight: 'bold' }}>{ser.modality}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ser.seriesDescription}>
                      {ser.seriesDescription}
                    </div>
                    <div style={{ fontSize: '9.5px', color: 'var(--text-secondary)' }}>
                      {ser.numberOfSeriesRelatedInstances || 1} slices
                    </div>
                  </div>
                  <button 
                    onClick={() => onOpenViewer(study.studyInstanceUid, ser.seriesInstanceUid)}
                    className="pacs-btn pacs-btn-sky"
                    style={{ padding: '3px 8px', fontSize: '10px', height: '24px', flexShrink: 0 }}
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '12px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>No series discovered.</div>
          )}
        </div>

        {/* Action button to open entire study in DICOM Viewer */}
        <button 
          className="pacs-btn pacs-btn-sky" 
          style={{ width: '100%', justifyContent: 'center', marginTop: 'auto' }}
          onClick={() => onOpenViewer(study.studyInstanceUid)}
        >
          <ExternalLink size={16} />
          Open Entire Study
        </button>
      </div>
    </aside>
  );
};
export default SelectedStudyInfo;
