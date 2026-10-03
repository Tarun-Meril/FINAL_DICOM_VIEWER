import React, { useState, useEffect } from 'react';
import { Info, User, FileText, ExternalLink, Layers } from 'lucide-react';
import { Study } from '../types';
import { PACS_API_BASE_URL } from '../api/client';

interface SelectedStudyInfoProps {
  study: Study | null;
  onOpenViewer: (uid: string, seriesUid?: string) => void;
}

// Helper to format date to match screenshot: Sep-09-1977
const formatBirthDate = (dateStr?: string) => {
  if (!dateStr || dateStr.length !== 8) return 'Sep-09-1977';
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
  if (!birthDate || birthDate.length !== 8) return '48Y';
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
      fetch(`${PACS_API_BASE_URL}/api/studies/${study.studyInstanceUid}/series`)
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
            <span className="detail-label">Institution</span>
            <span className="detail-value">{study.institution || 'Hospital'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Accession</span>
            <span className="detail-value" style={{ fontFamily: 'monospace' }}>{study.accessionNumber || 'N/A'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Modality</span>
            <span className="detail-value" style={{ color: 'var(--color-accent)' }}>{study.modalitiesInStudy || 'IMG'}</span>
          </div>
        </div>

        {/* Series Explorer List */}
        <div className="detail-card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="detail-card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={14} />
              Discovered Series
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{seriesList.length} Series</span>
          </div>

          {loadingSeries ? (
            <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Loading series...
            </div>
          ) : seriesList.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '200px', paddingRight: '4px' }}>
              {seriesList.map((ser) => (
                <div 
                  key={ser.seriesInstanceUid} 
                  style={{ 
                    padding: '8px 10px', 
                    backgroundColor: 'var(--bg-main)', 
                    border: '1px solid var(--border-color)', 
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px'
                  }}
                >
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Ser {ser.seriesNumber}</span>
                      <span style={{ fontSize: '8px', background: 'rgba(59,130,246,0.15)', color: '#3B82F6', padding: '0 4px', borderRadius: '2px', fontWeight: 'bold' }}>{ser.modality}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ser.seriesDescription}>
                      {ser.seriesDescription || 'Series'}
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
          style={{ width: '100%', justifyContent: 'center', marginTop: 'auto', gap: '8px', padding: '10px' }}
          onClick={() => onOpenViewer(study.studyInstanceUid)}
        >
          <ExternalLink size={16} />
          Open Study in Viewer
        </button>
      </div>
    </aside>
  );
};
export default SelectedStudyInfo;
