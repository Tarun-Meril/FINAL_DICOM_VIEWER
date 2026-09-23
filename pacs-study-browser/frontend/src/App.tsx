import React, { useState, useMemo, useCallback } from 'react';
import { useStudies } from './hooks/useStudies';
import { DashboardLayout } from './layouts/DashboardLayout';
import { SearchFilters } from './components/SearchFilters';
import { StudyListTable } from './components/StudyListTable';
import { SelectedStudyInfo } from './components/SelectedStudyInfo';
import { ImportZone } from './components/ImportZone';
import { SettingsPage } from './pages/SettingsPage';
import { ViewerStatusModal } from './components/ViewerStatusModal';

const VIEWER_BASE_URL = (import.meta.env.VITE_VIEWER_BASE_URL || 'http://localhost:5174').replace(/\/+$/, '');
const VIEWER_API_URL = (import.meta.env.VITE_VIEWER_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

const checkViewerHealth = async (baseUrl: string, timeoutMs: number = 1500): Promise<boolean> => {
  const normalizedUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    await fetch(normalizedUrl, { method: 'GET', mode: 'no-cors', signal: controller.signal });
    clearTimeout(timeoutId);
    return true;
  } catch (err) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(normalizedUrl, { method: 'GET', mode: 'cors', signal: controller.signal });
      clearTimeout(timeoutId);
      return res.ok || res.status < 500;
    } catch (e) {
      return false;
    }
  }
};

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('browser');
  const {
    studies,
    isLoading,
    filters,
    setFilters,
    selectedStudyUid,
    setSelectedStudyUid,
    uploadDicomFiles,
    refreshStudies
  } = useStudies();

  // Viewer launch & health check modal state
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    status: 'connecting' | 'error';
    targetStudyUid: string | null;
    targetSeriesUid?: string;
    attemptCount: number;
  }>({
    isOpen: false,
    status: 'connecting',
    targetStudyUid: null,
    attemptCount: 0,
  });

  // Find the selected study object
  const selectedStudy = useMemo(() => {
    return studies.find(s => s.studyInstanceUid === selectedStudyUid) || null;
  }, [studies, selectedStudyUid]);

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

  const launchViewerTab = useCallback((studyUid: string, _seriesUid?: string) => {
    const targetUrl = `${VIEWER_BASE_URL}/viewer/${studyUid}`;
    console.log(`[PACS] Opening DICOM Viewer for StudyUID ${studyUid} at ${targetUrl}`);
    try {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.warn('[PACS] Window open failed:', err);
    }
  }, []);

  const pollViewerHealth = useCallback((studyUid: string, seriesUid?: string, currentAttempt: number = 1) => {
    const maxAttempts = 10;
    if (currentAttempt > maxAttempts) {
      setModalState(prev => ({ ...prev, status: 'error', attemptCount: maxAttempts }));
      return;
    }

    setTimeout(async () => {
      const healthy = await checkViewerHealth(VIEWER_BASE_URL);
      if (healthy) {
        setModalState(prev => ({ ...prev, isOpen: false }));
        launchViewerTab(studyUid, seriesUid);
      } else {
        const nextAttempt = currentAttempt + 1;
        setModalState(prev => ({ ...prev, attemptCount: nextAttempt }));
        pollViewerHealth(studyUid, seriesUid, nextAttempt);
      }
    }, 1000);
  }, [launchViewerTab]);

  const handleOpenViewer = (studyUid: string, seriesUid?: string) => {
    if (!studyUid) return;
    const targetUrl = `${VIEWER_BASE_URL}/viewer/${studyUid}`;
    console.log(`[PACS] Opening DICOM Viewer for StudyUID ${studyUid} at ${targetUrl}`);

    // Synchronously open viewer tab
    try {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.warn('[PACS] Window open failed:', err);
    }

    // Asynchronously notify backend selection endpoint
    try {
      const payload = {
        studyInstanceUID: studyUid,
        patientId: selectedStudy?.patientId || '',
        accessionNumber: selectedStudy?.accessionNumber || '',
        seriesUIDs: seriesUid ? [seriesUid] : [],
        timestamp: Date.now()
      };
      fetch(`${VIEWER_API_URL}/api/studies/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(err => console.warn('[PACS] Sync select notice:', err));
    } catch (err) {
      console.warn('[PACS] Background sync error:', err);
    }
  };

  const handleRetryModal = () => {
    if (!modalState.targetStudyUid) return;
    launchViewerTab(modalState.targetStudyUid, modalState.targetSeriesUid);
    setModalState(prev => ({ ...prev, status: 'connecting', attemptCount: 1 }));
    pollViewerHealth(modalState.targetStudyUid, modalState.targetSeriesUid, 1);
  };

  const handleCloseModal = () => {
    setModalState(prev => ({ ...prev, isOpen: false }));
  };

  const handleImportClick = () => {
    setActiveTab('import');
  };

  return (
    <DashboardLayout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onRefresh={refreshStudies}
      isLoading={isLoading}
      onClearFilters={handleClearFilters}
      onImportClick={handleImportClick}
    >
      {activeTab === 'browser' && (
        <>
          {/* Center Panel (Filters & Table) */}
          <div className="center-panel">
            <SearchFilters filters={filters} setFilters={setFilters} />
            <StudyListTable
              studies={studies}
              selectedStudyUid={selectedStudyUid}
              setSelectedStudyUid={setSelectedStudyUid}
              onDoubleClick={handleOpenViewer}
            />
          </div>

          {/* Right Panel (Study Details) */}
          <SelectedStudyInfo
            study={selectedStudy}
            onOpenViewer={handleOpenViewer}
          />
        </>
      )}

      {activeTab === 'local' && (
        <div className="center-panel">
          <ImportZone onUpload={uploadDicomFiles} />
        </div>
      )}

      {activeTab === 'import' && (
        <div className="center-panel">
          <ImportZone onUpload={uploadDicomFiles} />
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="center-panel">
          <SettingsPage />
        </div>
      )}

      {/* Viewer Health & Launch Modal */}
      <ViewerStatusModal
        isOpen={modalState.isOpen}
        status={modalState.status}
        viewerUrl={VIEWER_BASE_URL}
        attemptCount={modalState.attemptCount}
        maxAttempts={10}
        onRetry={handleRetryModal}
        onClose={handleCloseModal}
      />
    </DashboardLayout>
  );
};
export default App;
