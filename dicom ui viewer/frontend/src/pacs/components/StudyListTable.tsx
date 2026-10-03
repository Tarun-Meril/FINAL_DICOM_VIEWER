import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Study } from '../types';

interface StudyListTableProps {
  studies: Study[];
  selectedStudyUid: string | null;
  setSelectedStudyUid: (uid: string | null) => void;
  onDoubleClick: (uid: string) => void;
}

// Helper to format date to match screenshot: Jan-01-2024
const formatStudyDate = (dateStr?: string) => {
  if (!dateStr || dateStr.length !== 8) return dateStr || '-';
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

// Helper to calculate age from birthdate (e.g. 19750812 -> 48Y)
const calculateAge = (birthDate?: string) => {
  if (!birthDate || birthDate.length !== 8) return '48Y';
  const birthYear = parseInt(birthDate.substring(0, 4), 10);
  const currentYear = new Date().getFullYear();
  return `${currentYear - birthYear}Y`;
};

export const StudyListTable: React.FC<StudyListTableProps> = ({
  studies,
  selectedStudyUid,
  setSelectedStudyUid,
  onDoubleClick
}) => {
  
  const getStatusClass = (status?: string) => {
    const s = status?.toUpperCase() || 'UNREAD';
    if (s === 'READ') return 'status-badge status-read';
    if (s === 'IN PROGRESS') return 'status-badge status-progress';
    if (s === 'COMPLETED') return 'status-badge status-completed';
    return 'status-badge status-unread';
  };

  return (
    <div className="grid-container">
      <div className="grid-scroll-area">
        <table className="grid-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}></th>
              <th>Patient Name</th>
              <th>MRN</th>
              <th style={{ width: '55px' }}>Age</th>
              <th style={{ width: '65px' }}>Gender</th>
              <th>Study Description</th>
              <th style={{ width: '120px' }}>Modality</th>
              <th style={{ width: '105px' }}>Study Date</th>
              <th style={{ width: '60px' }}>Series</th>
              <th style={{ width: '65px' }}>Images</th>
              <th>Institution</th>
              <th style={{ width: '110px', textAlign: 'center' }}>Status</th>
              <th style={{ width: '80px', textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {studies.length === 0 ? (
              <tr>
                <td colSpan={13} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  No studies found in the archive.
                </td>
              </tr>
            ) : (
              studies.map(study => {
                const isSelected = selectedStudyUid === study.studyInstanceUid;
                const age = calculateAge(study.patientBirthDate);
                const gender = study.patientSex || 'O';
                const formattedDate = formatStudyDate(study.studyDate);

                return (
                  <tr
                    key={study.studyInstanceUid}
                    className={`grid-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedStudyUid(study.studyInstanceUid)}
                    onDoubleClick={() => onDoubleClick(study.studyInstanceUid)}
                  >
                    <td style={{ textAlign: 'center', paddingLeft: '8px', paddingRight: '0' }}>
                      <ChevronRight size={14} style={{ color: isSelected ? 'var(--color-accent)' : 'var(--text-muted)' }} />
                    </td>
                    <td style={{ fontWeight: 500 }}>{study.patientName}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{study.patientId}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{age}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{gender}</td>
                    <td>{study.studyDescription || '(No Description)'}</td>
                    <td>
                      <span className="modality-tag">{study.modalitiesInStudy || 'OT'}</span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{formattedDate}</td>
                    <td style={{ textAlign: 'center' }}>{study.numberOfStudyRelatedSeries || 1}</td>
                    <td style={{ textAlign: 'center' }}>{study.numberOfStudyRelatedInstances || 1}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{study.institution || 'Hospital'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={getStatusClass(study.status)}>
                        {study.status || 'UNREAD'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDoubleClick(study.studyInstanceUid);
                        }}
                        className="pacs-btn pacs-btn-sky"
                        style={{ padding: '3px 10px', fontSize: '11px', height: '24px', cursor: 'pointer' }}
                        title="Open study in diagnostic viewer"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer matching screenshot */}
      <div className="grid-footer">
        <div className="pagination-text">
          Showing 1 to {studies.length} of {studies.length} studies
        </div>
        <div className="pagination-controls">
          <button className="page-btn active">1</button>
          <button className="page-btn" disabled>2</button>
          <button className="page-btn" disabled>3</button>
        </div>
      </div>
    </div>
  );
};
export default StudyListTable;
