import React, { useState } from 'react';
import ViewerTabBar from './ViewerTabBar';
import ViewportGrid from './ViewportGrid';
import EmptyViewerState from './EmptyViewerState';
import LoadingOverlay from './LoadingOverlay';
import { API_BASE_URL } from '../config';
import DragDropOverlay from './DragDropOverlay';
import CPRWorkspace from './CPRWorkspace';
import MPRViewerCore from './mpr/MPRViewerCore';
import VRViewerCore from './vr/VRViewerCore';
import { getRenderingEngine } from '@cornerstonejs/core';

interface StudyTab {
  id: string;
  label: string;
}

interface MainViewerProps {
  layout: string;
  activeTool: string;
  activeViewportId: number;
  vizMode: '2d' | 'mpr' | 'mip' | 'vr' | 'cpr';
  viewportCommand: { type: string; viewportId: number; timestamp: number } | null;
  onActiveViewportChange: (id: number) => void;
  onStatsChange?: (stats: any) => void;
  setViewportCommand: (cmd: any) => void;
  activeStats: any;
  study?: any | null;
  series?: any[];
  metadataOverlayOpen?: boolean;
  onActionCommand?: (action: string) => void;
  readOnly?: boolean;
  sharePermissions?: any;
}

export default function MainViewer({ 
  layout, 
  activeTool, 
  activeViewportId, 
  vizMode, 
  viewportCommand, 
  onActiveViewportChange, 
  onStatsChange, 
  setViewportCommand,
  activeStats,
  study,
  series,
  metadataOverlayOpen,
  onActionCommand,
  readOnly,
  sharePermissions
}: MainViewerProps) {
  const [tabs, setTabs] = useState<StudyTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');

  // Auto-initialize or switch tabs when study is fetched from PACS
  React.useEffect(() => {
    if (study) {
      const newTab = {
        id: `study-${study.studyInstanceUid}`,
        label: study.studyDescription || study.patientName || 'DICOM Study'
      };
      setTabs([newTab]);
      setActiveTabId(newTab.id);
    } else {
      setTabs([]);
      setActiveTabId('');
    }
  }, [study]);

  // When returning to 2D / MIP from 3D overlays, trigger window resize and re-render Cornerstone canvases
  React.useEffect(() => {
    if (vizMode === '2d' || vizMode === 'mip') {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        try {
          const re = getRenderingEngine('medview-rendering-engine');
          if (re && !re.hasBeenDestroyed && re.getViewports().length > 0) {
            try {
              re.resize(false, false);
              re.render();
            } catch {
              // Ignore transient viewport resize errors while switching modes
            }
          }
        } catch (err) {
          console.warn('[MainViewer] Failed to refresh rendering engine on 2D return:', err);
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [vizMode]);

  const getSeriesCount = (s: any): number =>
    Number(s?.numberOfSeriesRelatedInstances || s?.number_of_series_related_instances || s?.num_instances || 0);

  const activeSeriesObj = series?.find(
    (s) => (s.seriesInstanceUid || s.series_instance_uid) === activeStats?.seriesInstanceUid
  );

  // Find volumetric series (>1 slice), sorted by instance count descending
  const sortedVolumetric = [...(series || [])].sort((a, b) => getSeriesCount(b) - getSeriesCount(a));

  // If the currently viewed series has multiple slices, use it; otherwise auto-promote to the main volumetric CT series
  const chosenSeries = (activeSeriesObj && getSeriesCount(activeSeriesObj) > 1)
    ? activeSeriesObj
    : (activeSeriesObj || sortedVolumetric[0]);

  const mprSeriesUid: string | undefined =
    chosenSeries
      ? (chosenSeries.seriesInstanceUid || chosenSeries.series_instance_uid)
      : undefined;

  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);


  // Drag over states
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (!e.dataTransfer.types.includes('Files')) {
      return;
    }
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) {
      alert("No files dropped.");
      return;
    }
    
    setIsLoading(true);
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    
    fetch(`${API_BASE_URL}/api/upload`, {
      method: 'POST',
      body: formData
    })
      .then((res) => res.json())
      .then((json) => {
        setIsLoading(false);
        if (json.status === 'success' || json.success) {
          const results = json.results || json.data || [];
          const patientName = results[0]?.patient_name || results[0]?.patientName || 'DICOM Study';
          const studyUid = results[0]?.study_uid || results[0]?.studyInstanceUid;
          
          alert(`Import successful! Uploaded ${files.length} DICOM instances.`);
          if (studyUid) {
            const newTab = { id: `study-${studyUid}`, label: patientName };
            setTabs((prev) => [...prev, newTab]);
            setActiveTabId(newTab.id);
          } else {
            alert('Upload succeeded but no Study UID was resolved.');
          }
        } else {
          alert('Upload failed: ' + (json.message || 'Invalid DICOM response'));
        }
      })
      .catch((err) => {
        setIsLoading(false);
        console.error('Upload failed:', err);
        alert('DICOM upload request failed. Please check the backend connection.');
      });
  };

  const simulateLoadingStudy = (customName?: string) => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      const nextNum = tabs.length + 1;
      const label = customName || (nextNum === 1 ? 'CT Chest W Contrast' : nextNum === 2 ? 'MRI Brain' : nextNum === 3 ? 'PET CT' : `Study Series ${nextNum}`);
      const newTab = { id: `study-${Date.now()}`, label };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    }, 1200); // 1.2s realistic loading delay
  };

  const handleTabSelect = (id: string) => {
    setActiveTabId(id);
  };

  const handleTabClose = (id: string) => {
    const updatedTabs = tabs.filter((t) => t.id !== id);
    setTabs(updatedTabs);
    
    // Adjust active tab index fallback
    if (activeTabId === id && updatedTabs.length > 0) {
      setActiveTabId(updatedTabs[updatedTabs.length - 1].id);
    } else if (updatedTabs.length === 0) {
      setActiveTabId('');
    }
  };

  const handleTabAdd = () => {
    alert("Please select a study from the PACS Study Browser to open new sessions.");
  };


  return (
    <div 
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex-1 flex flex-col h-full bg-[#000000] overflow-hidden"
    >
      {tabs.length > 0 ? (
        /* STUDY VIEWER STATE */
        <div className="flex-grow flex flex-col h-full min-h-0 min-w-0">
          
          {/* Top Tabs (32px) */}
          <ViewerTabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onTabSelect={handleTabSelect}
            onTabClose={handleTabClose}
            onTabAdd={handleTabAdd}
          />

          {/* MIP parameters controller header bar overlay */}
          {vizMode === 'mip' && (
            <div className="h-9 bg-[#14181E] border-b border-[#1F232A] px-3 flex items-center gap-4 text-[11px] text-[#A8A8A8] select-none shrink-0 border-t border-t-white/5">
              <span className="font-bold text-[10px] uppercase text-white tracking-wider">MIP Parameters:</span>
              <div className="flex items-center gap-1.5 pl-2">
                <span>Slab Thickness:</span>
                <select 
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 5;
                    if (setViewportCommand) {
                      setViewportCommand({
                        type: `slabThickness:${val}`,
                        viewportId: -1,
                        timestamp: Date.now()
                      });
                    }
                  }}
                  className="bg-[#1C1F26] border border-[#353C48] rounded-[3px] text-white px-1.5 py-0.5 outline-none cursor-pointer"
                >
                  <option value="5">5 mm (Standard)</option>
                  <option value="10">10 mm</option>
                  <option value="20">20 mm</option>
                  <option value="50">50 mm</option>
                  <option value="100">100 mm (Full Slab)</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5 border-l border-[#1F232A] pl-4">
                <span>Projection Direction:</span>
                <select className="bg-[#1C1F26] border border-[#353C48] rounded-[3px] text-white px-1.5 py-0.5 outline-none cursor-pointer">
                  <option>Axial Projection</option>
                  <option>Coronal Projection</option>
                  <option>Sagittal Projection</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5 border-l border-[#1F232A] pl-4">
                <span>Sliding Slab Offset:</span>
                <input type="range" min="0" max="100" defaultValue="50" className="w-24 h-1 bg-[#1F232A] rounded-lg appearance-none cursor-pointer accent-[#2E7DFF]" />
              </div>
            </div>
          )}
          
          {/* Main Viewport Grid Area (stretches to fill) */}
          <div className="flex-1 min-h-0 min-w-0 relative">
            {/* ViewportGrid: kept mounted with visibility/position styling so WebGL contexts,
                canvases, loaded slices, and tool groups remain intact across 2D/3D mode transitions
                without collapsing to 0x0 (which causes WebGL framebuffer & VAO errors). */}
            <div 
              className="w-full h-full"
              style={(vizMode === '2d' || vizMode === 'mip') ? {
                position: 'relative',
                width: '100%',
                height: '100%',
              } : {
                display: 'none',
              }}
            >
              {(vizMode === '2d' || vizMode === 'mip') && (
                <ViewportGrid 
                  layout={layout} 
                  activeTool={activeTool}
                  vizMode={vizMode}
                  viewportCommand={viewportCommand}
                  onActiveViewportChange={onActiveViewportChange}
                  onStatsChange={onStatsChange}
                  study={study}
                  metadataOverlayOpen={metadataOverlayOpen}
                  onActionCommand={onActionCommand}
                  readOnly={readOnly}
                  sharePermissions={sharePermissions}
                />
              )}
            </div>

            {/* 3D Visualizer Overlays */}
            {/* VR renders the full volume-rendering workstation directly — no
                intermediate panel, no second click, no external window. It is
                the same component the standalone /vr route mounts. */}
            {vizMode === 'vr' && (
              <div className="absolute inset-0 z-10 w-full h-full">
                <VRViewerCore
                  key={`vr_${study?.studyInstanceUid || study?.study_instance_uid || ''}_${mprSeriesUid || ''}`}
                  studyUID={study?.studyInstanceUid || study?.study_instance_uid}
                  seriesUID={mprSeriesUid}
                  apiBase={API_BASE_URL}
                  onClose={() => onActionCommand?.('vr')}
                  variant="embedded"
                />
              </div>
            )}
            {/* MPR renders the full multiplanar workstation directly — no
                intermediate panel, no second click, no external window. It is
                the same component the standalone /mpr route mounts. */}
            {vizMode === 'mpr' && (
              <div className="absolute inset-0 z-10 w-full h-full">
                <MPRViewerCore
                  key={`mpr_${study?.studyInstanceUid || study?.study_instance_uid || ''}_${mprSeriesUid || ''}`}
                  studyUID={study?.studyInstanceUid || study?.study_instance_uid}
                  seriesUID={mprSeriesUid}
                  apiBase={API_BASE_URL}
                  onClose={() => onActionCommand?.('mpr')}
                  variant="embedded"
                />
              </div>
            )}
            {vizMode === 'cpr' && (
              <div className="absolute inset-0 z-10 w-full h-full">
                <CPRWorkspace />
              </div>
            )}
          </div>


        </div>
      ) : (
        /* EMPTY STATE */
        <EmptyViewerState 
          onLoadSample={() => onActionCommand ? onActionCommand('loadDefaultStudy') : simulateLoadingStudy()}
          onNavigateToPacs={() => onActionCommand ? onActionCommand('openPacs') : undefined}
        />
      )}

      {/* Progress loader overlays */}
      {isLoading && <LoadingOverlay />}

      {/* Hovering Drag & Drop Overlay */}
      {isDragging && <DragDropOverlay />}

    </div>
  );
}
