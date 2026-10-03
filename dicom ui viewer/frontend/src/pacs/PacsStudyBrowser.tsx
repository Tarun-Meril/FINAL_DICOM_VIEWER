import React, { useState } from 'react';
import './styles/pacs.css';
import { DashboardLayout } from './layouts/DashboardLayout';
import { SearchFilters } from './components/SearchFilters';
import { StudyListTable } from './components/StudyListTable';
import { SelectedStudyInfo } from './components/SelectedStudyInfo';
import { ImportZone } from './components/ImportZone';
import { SettingsPage } from './pages/SettingsPage';
import { useStudies } from './hooks/useStudies';

interface PacsStudyBrowserProps {
  onOpenStudy: (studyInstanceUid: string) => void;
}

export const PacsStudyBrowser: React.FC<PacsStudyBrowserProps> = ({ onOpenStudy }) => {
  const [activeTab, setActiveTab] = useState<'browser' | 'local' | 'settings'>('browser');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const {
    studies,
    isLoading,
    error,
    filters,
    setFilters,
    selectedStudyUid,
    setSelectedStudyUid,
    seriesList,
    isLoadingSeries,
    uploadDicomFiles,
    refreshStudies
  } = useStudies();

  const selectedStudy = studies.find(s => s.studyInstanceUid === selectedStudyUid) || null;

  const handleClearFilters = () => {
    setFilters({
      patientName: '',
      patientId: '',
      accessionNumber: '',
      modalities: '',
      studyDate: '',
      studyDescription: '',
    });
  };

  const handleOpenViewer = (studyUid: string, _seriesUid?: string) => {
    if (!studyUid) return;
    console.log(`[MerilView] Navigating from PACS to Viewer for StudyUID: ${studyUid}`);
    try {
      fetch(`${API_BASE_URL}/api/studies/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studyInstanceUID: studyUid,
          seriesUIDs: _seriesUid ? [_seriesUid] : [],
          timestamp: Date.now()
        })
      }).catch(() => {});
    } catch (_) {}

    if ((window as any).electronAPI?.openStudy) {
      (window as any).electronAPI.openStudy(studyUid);
    }
    onOpenStudy(studyUid);
  };

  const handleImportClick = () => {
    setIsImportModalOpen(true);
  };

  return (
    <div className="w-full h-full relative">
      <DashboardLayout
        activeTab={activeTab}
        setActiveTab={(tab: string) => setActiveTab(tab as any)}
        onRefresh={refreshStudies}
        isLoading={isLoading}
        onClearFilters={handleClearFilters}
        onImportClick={handleImportClick}
      >
        {activeTab === 'browser' && (
          <>
            {/* Center Area: Filters & Studies Grid Table */}
            <main className="center-panel">
              <SearchFilters filters={filters} setFilters={setFilters} />
              
              {error && (
                <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px', color: '#f87171', fontSize: '13px' }}>
                  {error}
                </div>
              )}

              <StudyListTable
                studies={studies}
                selectedStudyUid={selectedStudyUid}
                setSelectedStudyUid={setSelectedStudyUid}
                onDoubleClick={handleOpenViewer}
              />
            </main>

            {/* Right Panel: Selected Study Inspector */}
            <SelectedStudyInfo
              study={selectedStudy}
              series={seriesList}
              isLoadingSeries={isLoadingSeries}
              onOpenViewer={handleOpenViewer}
            />
          </>
        )}

        {activeTab === 'local' && (
          <main className="center-panel" style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>Import Local DICOM Archive</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Drag and drop raw .dcm files or entire folder stacks to parse and index them into your local persistent PACS archive.
              </p>
            </div>
            <ImportZone onUpload={uploadDicomFiles} />
          </main>
        )}

        {activeTab === 'settings' && (
          <main className="center-panel">
            <SettingsPage />
          </main>
        )}
      </DashboardLayout>

      {/* Import Modal */}
      {isImportModalOpen && (
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
            backgroundColor: '#0d111a',
            border: '1px solid #1b2333',
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '680px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            color: '#f8fafc',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Import DICOM Studies</h3>
              <button
                onClick={() => setIsImportModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '18px' }}
              >
                ✕
              </button>
            </div>
            
            <ImportZone onUpload={uploadDicomFiles} />

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                className="pacs-btn pacs-btn-outline"
                onClick={() => {
                  setIsImportModalOpen(false);
                  refreshStudies();
                }}
              >
                Close & Refresh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default PacsStudyBrowser;
