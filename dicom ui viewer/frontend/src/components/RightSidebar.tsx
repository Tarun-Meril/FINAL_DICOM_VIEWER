import React, { useState, useRef, useEffect } from 'react';
import { Tag, Activity, FileText, List, Sun, Sliders, Layers, Eye, ChevronRight, ChevronLeft } from 'lucide-react';
import { clinicalFacade } from '../clinical';
import ReportPanel from './report/ReportPanel';

interface RightSidebarProps {
  study?: any | null;
  activeStats?: any;
  on3DControlAction?: (action: string, payload?: any) => void;
}

export default function RightSidebar({ study, activeStats, on3DControlAction }: RightSidebarProps) {
  const [activeTab, setActiveTab] = useState<'metadata' | 'reports'>('metadata');

  // Collapse State
  const [width, setWidth] = useState(320);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [preCollapseWidth, setPreCollapseWidth] = useState(320);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Resize handler
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // For right sidebar, moving mouse left (negative delta) increases width
      const newWidth = startWidth - (moveEvent.clientX - startX);
      setWidth(Math.min(460, Math.max(280, newWidth)));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleCollapseToggle = () => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setWidth(preCollapseWidth);
    } else {
      setPreCollapseWidth(width);
      setIsCollapsed(true);
      setWidth(44);
    }
  };

  // 3D Clinical States - REMOVED

  return (
    <div 
      ref={sidebarRef}
      style={{ width: `${width}px` }}
      className="relative flex flex-col h-full bg-[#1F232A] border-l border-[#353C48] select-none text-[#C9D1D9] shrink-0 overflow-hidden transition-all duration-200 ease-in-out"
      role="complementary"
      aria-label="DICOM Metadata & Clinical Controls Sidebar"
    >
      {/* DRAGGABLE RESIZE HANDLE (Hidden when collapsed) */}
      {!isCollapsed && (
        <div 
          onMouseDown={handleMouseDown}
          className="absolute left-0 top-0 w-[4px] h-full hover:bg-[#3B82F6]/70 cursor-col-resize z-40 transition-colors duration-150 active:bg-[#3B82F6]"
          role="separator"
          aria-label="Resize Handle"
        />
      )}

      {isCollapsed ? (
        <div className="flex flex-col items-center w-full py-4 h-full gap-3 overflow-y-auto no-scrollbar">
          <button
            onClick={handleCollapseToggle}
            title="Expand Sidebar"
            className="flex items-center justify-center w-8 h-8 rounded-md bg-[#252B34] border border-[#353C48] hover:bg-[#2A323D] text-white cursor-pointer shrink-0 transition-subtle outline-none"
          >
            <ChevronLeft className="w-5 h-5 text-[#8B949E]" />
          </button>
          
          <div className="h-[1px] w-6 bg-[#353C48] shrink-0 my-1" />

          <button 
            onClick={() => { setIsCollapsed(false); setWidth(preCollapseWidth); setActiveTab('metadata'); }}
            title="Metadata"
            className={`group flex items-center justify-center w-8 h-8 rounded-md border cursor-pointer outline-none transition-all duration-150 shrink-0 ${activeTab === 'metadata' ? 'bg-[#252B34] border-[#353C48] text-[#3B82F6]' : 'bg-transparent border-transparent text-[#8B949E] hover:text-white hover:bg-[#252B34]'}`}
          >
            <Tag className="w-4 h-4 transition-transform group-hover:scale-110" />
          </button>

          <button 
            onClick={() => { setIsCollapsed(false); setWidth(preCollapseWidth); setActiveTab('reports'); }}
            title="Reports"
            className={`group flex items-center justify-center w-8 h-8 rounded-md border cursor-pointer outline-none transition-all duration-150 shrink-0 ${activeTab === 'reports' ? 'bg-[#252B34] border-[#353C48] text-[#3B82F6]' : 'bg-transparent border-transparent text-[#8B949E] hover:text-white hover:bg-[#252B34]'}`}
          >
            <FileText className="w-4 h-4 transition-transform group-hover:scale-110" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col w-full h-full overflow-hidden">
          {/* HEADER TABS (40px) */}
          <div className="flex items-center border-b border-[#353C48] h-[40px] px-2 pl-3 bg-[#191D24] shrink-0 gap-1 justify-between">
            <div className="flex gap-1 flex-1">

              <button
                onClick={() => setActiveTab('metadata')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold rounded cursor-pointer transition-colors ${
                  activeTab === 'metadata' ? 'bg-[#2E7DFF] text-white' : 'text-[#8B949E] hover:text-white'
                }`}
              >
                <Tag className="w-3 h-3" />
                <span>Metadata</span>
              </button>

              <button
                onClick={() => setActiveTab('reports')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold rounded cursor-pointer transition-colors ${
                  activeTab === 'reports' ? 'bg-[#2E7DFF] text-white' : 'text-[#8B949E] hover:text-white'
                }`}
              >
                <FileText className="w-3 h-3" />
                <span>Reports</span>
              </button>
            </div>

            {/* Collapse Trigger Button */}
            <button
              onClick={handleCollapseToggle}
              title="Collapse Sidebar"
              className="flex items-center justify-center p-1 ml-1 rounded hover:bg-[#252B34] text-[#8B949E] hover:text-white cursor-pointer transition-subtle outline-none shrink-0"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* BODY */}
          <div className="flex-1 flex flex-col gap-3 p-3 overflow-y-auto no-scrollbar">

            {activeTab === 'metadata' && (
              <>
                {/* Viewport Specs Section */}
                <div className="flex flex-col gap-2 p-3 bg-[#252B34] border border-[#353C48] rounded-[6px]">
                  <h3 className="font-sans font-bold text-[10px] uppercase text-[#8B949E] tracking-wider border-b border-[#353C48] pb-1.5 mb-1 flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5 text-[#3B82F6]" />
                    <span>Active Viewport Specs</span>
                  </h3>
                  <div className="grid grid-cols-[90px_1fr] gap-x-2 gap-y-1.5 text-[12px]">
                    <span className="text-[#8B949E]">Plane:</span>
                    <span className="font-semibold text-white">{activeStats?.plane || 'Axial'}</span>

                    <span className="text-[#8B949E]">Zoom:</span>
                    <span className="font-mono-numbers">{activeStats?.zoom || '100%'}</span>

                    <span className="text-[#8B949E]">WW / WL:</span>
                    <span className="font-mono-numbers">{activeStats?.windowWidth ?? 400} / {activeStats?.windowLevel ?? 40}</span>

                    <span className="text-[#8B949E]">Resolution:</span>
                    <span className="font-mono-numbers">{activeStats?.resolution || '512 × 512'}</span>

                    <span className="text-[#8B949E]">Spacing:</span>
                    <span className="font-mono-numbers">{activeStats?.spacing || '0.68 mm'}</span>
                  </div>
                </div>

                {/* Study Metadata Section */}
                <div className="flex flex-col gap-2 p-3 bg-[#252B34] border border-[#353C48] rounded-[6px]">
                  <h3 className="font-sans font-bold text-[10px] uppercase text-[#8B949E] tracking-wider border-b border-[#353C48] pb-1.5 mb-1 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-[#3B82F6]" />
                    <span>Study Tag Details</span>
                  </h3>
                  <div className="flex flex-col gap-2 text-[11px] font-sans">
                    <div className="flex flex-col">
                      <span className="text-[#8B949E] text-[10px] uppercase font-bold">Patient Name</span>
                      <span className="font-semibold text-white select-text truncate">{study?.patientName || '-'}</span>
                    </div>

                    <div className="flex flex-col border-t border-[#353C48]/30 pt-1.5">
                      <span className="text-[#8B949E] text-[10px] uppercase font-bold">Patient ID</span>
                      <span className="font-mono text-white select-text truncate">{study?.patientId || '-'}</span>
                    </div>

                    <div className="flex flex-col border-t border-[#353C48]/30 pt-1.5">
                      <span className="text-[#8B949E] text-[10px] uppercase font-bold">Modality</span>
                      <span className="font-semibold text-white">{study?.modalitiesInStudy || '-'}</span>
                    </div>

                    <div className="flex flex-col border-t border-[#353C48]/30 pt-1.5">
                      <span className="text-[#8B949E] text-[10px] uppercase font-bold">Institution</span>
                      <span className="text-white select-text truncate" title={study?.institution}>{study?.institution || '-'}</span>
                    </div>

                    <div className="flex flex-col border-t border-[#353C48]/30 pt-1.5">
                      <span className="text-[#8B949E] text-[10px] uppercase font-bold">Study UID</span>
                      <span className="font-mono text-[9px] text-[#A8A8A8] select-text break-all leading-tight">
                        {study?.studyInstanceUid || '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Detailed Image Metadata */}
                <div className="flex flex-col gap-2 p-3 bg-[#252B34] border border-[#353C48] rounded-[6px]">
                  <h3 className="font-sans font-bold text-[10px] uppercase text-[#8B949E] tracking-wider border-b border-[#353C48] pb-1.5 mb-1 flex items-center gap-1">
                    <List className="w-3.5 h-3.5 text-[#3B82F6]" />
                    <span>Image Summary</span>
                  </h3>
                  <div className="grid grid-cols-[90px_1fr] gap-x-2 gap-y-1.5 text-[12px]">
                    <span className="text-[#8B949E]">Series Num:</span>
                    <span className="font-semibold text-white">{activeStats?.seriesNumber || '-'}</span>

                    <span className="text-[#8B949E]">Series Desc:</span>
                    <span className="text-white truncate" title={activeStats?.seriesDescription}>{activeStats?.seriesDescription || '-'}</span>

                    <span className="text-[#8B949E]">Current Slice:</span>
                    <span className="font-mono-numbers">{activeStats?.imageIndex !== undefined ? activeStats.imageIndex : '-'}</span>

                    <span className="text-[#8B949E]">Total Slices:</span>
                    <span className="font-mono-numbers">{activeStats?.totalImages !== undefined ? activeStats.totalImages : '-'}</span>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'reports' && (
              <ReportPanel study={study} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
