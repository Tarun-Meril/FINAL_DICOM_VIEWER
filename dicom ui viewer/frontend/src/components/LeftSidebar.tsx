import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Search, SlidersHorizontal, ArrowDownUp, Calendar, Hospital, 
  User, ChevronLeft, ChevronRight, FolderClosed, Activity, Clock
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import { SeriesThumbnail } from './SeriesThumbnail';

interface LeftSidebarProps {
  study?: any | null;
  series?: any[];
  activeSeriesInstanceUid?: string | null;
  onLoadSeries: (seriesId: string, seriesLabel: string) => void;
  onShareStudy?: () => void;
  onCopyShareLink?: () => void;
}

const formatDicomDate = (dateStr?: string) => {
  if (!dateStr || dateStr.length !== 8) return dateStr || '-';
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  return `${year}-${month}-${day}`;
};

const calculateAge = (birthDate?: string) => {
  if (!birthDate || birthDate.length !== 8) return '48Y';
  const birthYear = parseInt(birthDate.substring(0, 4), 10);
  const currentYear = new Date().getFullYear();
  return `${currentYear - birthYear}Y`;
};

interface SidebarSectionProps {
  title: string;
  children: React.ReactNode;
}

function SidebarSection({ title, children }: SidebarSectionProps) {
  return (
    <div className="flex flex-col gap-2 p-3 bg-[#252B34] border border-[#353C48] rounded-[6px] transition-subtle">
      <h3 className="font-sans font-bold text-[10px] uppercase text-[#8B949E] tracking-wider border-b border-[#353C48] pb-1.5 mb-1 select-none">
        {title}
      </h3>
      <div className="flex flex-col gap-1.5 text-[12px] font-sans text-[#C9D1D9]">
        {children}
      </div>
    </div>
  );
}

interface SeriesCardProps {
  seriesNum: number;
  description: string;
  imagesCount: number;
  sliceThickness: string;
  active: boolean;
  seriesInstanceUid?: string;
  studyInstanceUid?: string;
  modality?: string;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function SeriesCard({ seriesNum, description, imagesCount, sliceThickness, active, seriesInstanceUid, studyInstanceUid, modality, onClick, onContextMenu }: SeriesCardProps) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable={true}
      onDragStart={(e) => {
        if (seriesInstanceUid) {
          e.dataTransfer.setData('text/plain', seriesInstanceUid);
          e.dataTransfer.setData('application/x-dicom-series', seriesInstanceUid);
          e.dataTransfer.effectAllowed = 'copyMove';
        }
      }}
      className={`flex gap-3 p-2 w-full text-left rounded-[6px] border transition-all duration-150 outline-none cursor-default select-none ${
        active 
          ? 'bg-[#191D24] border-[#3B82F6] shadow-[0_2px_8px_rgba(59,130,246,0.15)]' 
          : 'bg-[#252B34] border-[#353C48] hover:bg-[#2A323D] hover:border-[#4B5563]'
      }`}
    >
      {/* Thumbnail Image */}
      <SeriesThumbnail 
        studyUID={studyInstanceUid || 'unknown'} 
        seriesUID={seriesInstanceUid || 'unknown'} 
        imageIds={[]} 
        modality={modality || 'IMG'} 
        imagesCount={imagesCount} 
      />

      <div className="flex flex-col justify-center min-w-0">
        <span className="font-sans font-bold text-[10px] text-[#8B949E] uppercase tracking-wider leading-none mb-1 select-none">
          Series {seriesNum}
        </span>
        <span className="font-sans font-semibold text-[12px] text-white leading-tight truncate w-full mb-1">
          {description}
        </span>
        <div className="flex items-center gap-2 text-[11px] text-[#8B949E] font-mono-numbers leading-none">
          <span>{imagesCount} Slices</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#353C48]" />
          <span>{sliceThickness}</span>
        </div>
      </div>
    </button>
  );
}

export default function LeftSidebar({ study, series, activeSeriesInstanceUid, onLoadSeries, onShareStudy, onCopyShareLink }: LeftSidebarProps) {
  const [width, setWidth] = useState(320);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [preCollapseWidth, setPreCollapseWidth] = useState(320);
  const [activeTab, setActiveTab] = useState<'study' | 'patient'>('study');
  const [searchQuery, setSearchQuery] = useState('');

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; seriesInstanceUid: string } | null>(null);
  const [studyContextMenu, setStudyContextMenu] = useState<{ x: number; y: number } | null>(null);

  const sidebarRef = useRef<HTMLDivElement>(null);

  // Resize handler using document-level listeners
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = startWidth + (moveEvent.clientX - startX);
      setWidth(Math.min(420, Math.max(280, newWidth)));
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

  // Series items data source (dynamic from PACS if available)
  const seriesData = useMemo(() => {
    if (series && series.length > 0) {
      return series.map((s, idx) => ({
        num: parseInt(s.seriesNumber) || (idx + 1),
        desc: s.seriesDescription || `Series ${s.seriesNumber || (idx + 1)}`,
        count: s.numberOfSeriesRelatedInstances || 0,
        thickness: '1.25 mm',
        seriesInstanceUid: s.seriesInstanceUid,
        studyInstanceUid: s.studyInstanceUid || study?.studyInstanceUid || study?.study_instance_uid,
        modality: s.modality || 'CT'
      }));
    }
    return [];
  }, [series]);

  // Filter based on search query
  const filteredSeries = seriesData.filter(s => 
    s.desc.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.num.toString().includes(searchQuery)
  );

  return (
    <div 
      ref={sidebarRef}
      style={{ width: `${width}px` }}
      className="relative flex h-full bg-[#1F232A] border-r border-[#353C48] select-none text-[#C9D1D9] transition-all duration-200 ease-in-out shrink-0 overflow-hidden"
      role="navigation"
      aria-label="Study and Patient Sidebar"
    >
      {/* COLLAPSED VERTICAL STRIP CONTAINER */}
      {isCollapsed ? (
        <div className="flex flex-col items-center w-full py-4 h-full gap-3 overflow-y-auto no-scrollbar">
          <button
            onClick={handleCollapseToggle}
            title="Expand Sidebar"
            className="flex items-center justify-center w-8 h-8 rounded-md bg-[#252B34] border border-[#353C48] hover:bg-[#2A323D] text-white cursor-pointer shrink-0 transition-subtle outline-none"
          >
            <ChevronRight className="w-5 h-5 text-[#8B949E]" />
          </button>
          
          <div className="h-[1px] w-6 bg-[#353C48] shrink-0 my-1" />
          
          {/* Study Tab Expander Shortcut */}
          <button 
            onClick={() => {
              setIsCollapsed(false);
              setWidth(preCollapseWidth);
              setActiveTab('study');
            }}
            title="Study Tab"
            className={`group flex items-center justify-center w-8 h-8 rounded-md border cursor-pointer outline-none transition-all duration-150 shrink-0 ${
              activeTab === 'study' 
                ? 'bg-[#252B34] border-[#353C48] text-[#3B82F6]' 
                : 'bg-transparent border-transparent text-[#8B949E] hover:text-white hover:bg-[#252B34]'
            }`}
          >
            <FolderClosed className="w-5 h-5 transition-transform group-hover:scale-110" />
          </button>

          {/* Patient Tab Expander Shortcut */}
          <button 
            onClick={() => {
              setIsCollapsed(false);
              setWidth(preCollapseWidth);
              setActiveTab('patient');
            }}
            title="Patient Tab"
            className={`group flex items-center justify-center w-8 h-8 rounded-md border cursor-pointer outline-none transition-all duration-150 shrink-0 ${
              activeTab === 'patient' 
                ? 'bg-[#252B34] border-[#353C48] text-[#3B82F6]' 
                : 'bg-transparent border-transparent text-[#8B949E] hover:text-white hover:bg-[#252B34]'
            }`}
          >
            <User className="w-5 h-5 transition-transform group-hover:scale-110" />
          </button>
        </div>
      ) : (
        /* EXPANDED CONTENT WRAPPER */
        <div className="flex flex-col w-full h-full overflow-hidden">
          
          {/* TAB HEADER */}
          <div className="flex items-center justify-between border-b border-[#353C48] h-[40px] px-3 bg-[#191D24] shrink-0">
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('study')}
                className={`px-3 py-1 text-[12px] font-semibold rounded-[4px] cursor-pointer transition-all duration-150 outline-none border focus:outline-none focus:ring-0 ${
                  activeTab === 'study'
                    ? 'bg-[#252B34] border-[#353C48] text-white'
                    : 'bg-transparent border-transparent text-[#8B949E] hover:text-white hover:bg-[#252B34]/30'
                }`}
              >
                Study
              </button>
              <button
                onClick={() => setActiveTab('patient')}
                className={`px-3 py-1 text-[12px] font-semibold rounded-[4px] cursor-pointer transition-all duration-150 outline-none border focus:outline-none focus:ring-0 ${
                  activeTab === 'patient'
                    ? 'bg-[#252B34] border-[#353C48] text-white'
                    : 'bg-transparent border-transparent text-[#8B949E] hover:text-white hover:bg-[#252B34]/30'
                }`}
              >
                Patient
              </button>
            </div>
            
            {/* Collapse Trigger Button */}
            <button
              onClick={handleCollapseToggle}
              title="Collapse Sidebar"
              className="flex items-center justify-center p-1 rounded hover:bg-[#252B34] text-[#8B949E] hover:text-white cursor-pointer transition-subtle outline-none"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* TAB BODY (STUDY CONTENT) */}
          {activeTab === 'study' ? (
            <div className="flex-1 flex flex-col gap-3 p-3 overflow-y-auto no-scrollbar">
              
              {/* Patient Information Section */}
              <SidebarSection title="Patient Information">
                <div className="grid grid-cols-[85px_1fr] gap-x-2 gap-y-1">
                  <span className="text-[#8B949E]">Name:</span>
                  <span className="font-semibold text-white select-text">{study ? study.patientName : '-'}</span>
                  
                  <span className="text-[#8B949E]">Patient ID:</span>
                  <span className="font-mono-numbers select-text">{study ? study.patientId : '-'}</span>
                  
                  <span className="text-[#8B949E]">Age / Sex:</span>
                  <span className="select-text">
                    {study ? `${calculateAge(study.patientBirthDate)} / ${study.patientSex || 'O'}` : '-'}
                  </span>
                  
                  <span className="text-[#8B949E]">DOB:</span>
                  <span className="font-mono-numbers select-text">
                    {study ? formatDicomDate(study.patientBirthDate) : '-'}
                  </span>
                </div>
              </SidebarSection>

              {/* Study Information Section */}
              <div
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setStudyContextMenu({ x: e.clientX, y: e.clientY });
                }}
              >
                <SidebarSection title="Study Information">
                  <div className="grid grid-cols-[85px_1fr] gap-x-2 gap-y-1">
                    <span className="text-[#8B949E]">Study Date:</span>
                    <span className="font-mono-numbers select-text">
                      {study ? formatDicomDate(study.studyDate) : '-'}
                    </span>
                    
                    <span className="text-[#8B949E]">Study Time:</span>
                    <span className="font-mono-numbers select-text">
                      {study ? (study.studyTime ? `${study.studyTime.substring(0,2)}:${study.studyTime.substring(2,4)}:${study.studyTime.substring(4,6)}` : '-') : '-'}
                    </span>
                    
                    <span className="text-[#8B949E]">Modality:</span>
                    <span className="font-semibold text-[#3B82F6]">{study ? study.modalitiesInStudy : '-'}</span>
                    
                    <span className="text-[#8B949E]">Institution:</span>
                    <span className="select-text truncate" title={study ? study.institution : '-'}>
                      {study ? study.institution : '-'}
                    </span>
                    
                    <span className="text-[#8B949E]">Ref Physician:</span>
                    <span className="select-text">{study ? 'Dr. Sarah Smith' : '-'}</span>
                    
                    <span className="text-[#8B949E]">Accession #:</span>
                    <span className="font-mono-numbers select-text">{study ? study.accessionNumber : '-'}</span>
                    
                    <span className="text-[#8B949E]">Description:</span>
                    <span className="select-text italic">{study ? (study.studyDescription || '(No Description)') : '-'}</span>
                  </div>
                </SidebarSection>
              </div>

              {/* Series Explorer Section */}
              <div className="flex flex-col gap-2 flex-grow">
                <h3 className="font-sans font-bold text-[10px] uppercase text-[#8B949E] tracking-wider border-b border-[#353C48] pb-1.5 mb-1 select-none">
                  Series Explorer
                </h3>
                
                {/* Search, Filter, Sort Row */}
                <div className="flex gap-1.5 items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-[8px] w-3.5 h-3.5 text-[#8B949E]" />
                    <input
                      type="text"
                      placeholder="Search Series..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-[#252B34] border border-[#353C48] rounded-[4px] pl-8 pr-3 py-1.5 text-[12px] font-sans text-white placeholder-[#8B949E] outline-none focus:border-[#3B82F6] transition-subtle"
                    />
                  </div>
                  <button 
                    title="Filter Options"
                    className="flex items-center justify-center p-2 rounded-[4px] bg-[#252B34] border border-[#353C48] hover:bg-[#2A323D] text-[#C9D1D9] hover:text-white transition-subtle cursor-pointer outline-none"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    title="Sort Series"
                    className="flex items-center justify-center p-2 rounded-[4px] bg-[#252B34] border border-[#353C48] hover:bg-[#2A323D] text-[#C9D1D9] hover:text-white transition-subtle cursor-pointer outline-none"
                  >
                    <ArrowDownUp className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Series Cards Container */}
                <div className="flex flex-col gap-1.5 mt-1 overflow-y-visible">
                  {filteredSeries.length > 0 ? (
                    filteredSeries.map((series, index) => (
                      <SeriesCard
                        key={series.seriesInstanceUid || `series-${series.num}-${index}`}
                        seriesNum={series.num}
                        description={series.desc}
                        imagesCount={series.count}
                        sliceThickness={series.thickness}
                        active={series.seriesInstanceUid === activeSeriesInstanceUid}
                        seriesInstanceUid={series.seriesInstanceUid}
                        studyInstanceUid={series.studyInstanceUid}
                        modality={series.modality}
                        onClick={() => onLoadSeries(series.seriesInstanceUid || '', series.desc)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            seriesInstanceUid: series.seriesInstanceUid || ''
                          });
                        }}
                      />
                    ))
                  ) : (
                    <div className="text-center text-[12px] text-[#8B949E] italic py-4 select-none">
                      No matching series found
                    </div>
                  )}
                </div>

              </div>

            </div>
          ) : (
            /* TAB BODY (PATIENT CONTENT) */
            <div className="flex-1 flex flex-col gap-3 p-3 overflow-y-auto no-scrollbar">
              
              {/* Patient Profile Section */}
              <SidebarSection title="Patient Profile">
                <div className="grid grid-cols-[85px_1fr] gap-x-2 gap-y-1">
                  <span className="text-[#8B949E]">Name:</span>
                  <span className="font-semibold text-white select-text">{study ? study.patientName : '-'}</span>
                  
                  <span className="text-[#8B949E]">Patient ID:</span>
                  <span className="font-mono-numbers select-text">{study ? study.patientId : '-'}</span>
                  
                  <span className="text-[#8B949E]">Gender:</span>
                  <span className="select-text">{study ? (study.patientSex === 'M' ? 'Male' : study.patientSex === 'F' ? 'Female' : 'Other') : '-'}</span>
                  
                  <span className="text-[#8B949E]">Age:</span>
                  <span className="select-text">{study ? calculateAge(study.patientBirthDate) : '-'}</span>
                  
                  <span className="text-[#8B949E]">DOB:</span>
                  <span className="font-mono-numbers select-text">{study ? formatDicomDate(study.patientBirthDate) : '-'}</span>
                </div>
              </SidebarSection>

              {/* Clinical Timeline Section */}
              <SidebarSection title="Clinical History Timeline">
                <div className="relative flex flex-col pl-4 gap-4 mt-1 border-l-2 border-[#353C48]">
                  
                  {/* Timeline node 2026 */}
                  <div className="relative flex flex-col gap-0.5">
                    {/* Node Dot indicator */}
                    <div className="absolute left-[-21px] top-[4px] w-2.5 h-2.5 rounded-full bg-[#3B82F6] border-2 border-[#1F232A]"></div>
                    <span className="font-bold text-[#3B82F6] text-[11px] leading-none select-none">2026</span>
                    <span className="font-semibold text-white text-[12px]">CT Chest w/ Contrast</span>
                    <span className="text-[#8B949E] text-[11px] flex items-center gap-1.5">
                      <Hospital className="w-3 h-3" /> City Hospital
                    </span>
                  </div>

                  {/* Timeline node 2025 */}
                  <div className="relative flex flex-col gap-0.5">
                    <div className="absolute left-[-21px] top-[4px] w-2.5 h-2.5 rounded-full bg-[#8B949E] border-2 border-[#1F232A]"></div>
                    <span className="font-bold text-[#8B949E] text-[11px] leading-none select-none">2025</span>
                    <span className="font-semibold text-white text-[12px]">MRI Brain w/o Contrast</span>
                    <span className="text-[#8B949E] text-[11px] flex items-center gap-1.5">
                      <Hospital className="w-3 h-3" /> Neurological Institute
                    </span>
                  </div>

                  {/* Timeline node 2024 */}
                  <div className="relative flex flex-col gap-0.5">
                    <div className="absolute left-[-21px] top-[4px] w-2.5 h-2.5 rounded-full bg-[#8B949E] border-2 border-[#1F232A]"></div>
                    <span className="font-bold text-[#8B949E] text-[11px] leading-none select-none">2024</span>
                    <span className="font-semibold text-white text-[12px]">PET CT Body Axial</span>
                    <span className="text-[#8B949E] text-[11px] flex items-center gap-1.5">
                      <Hospital className="w-3 h-3" /> Cancer Care Center
                    </span>
                  </div>

                </div>
              </SidebarSection>

              {/* Previous Studies (Patient-Centric List) */}
              <div className="flex flex-col gap-2">
                <h3 className="font-sans font-bold text-[10px] uppercase text-[#8B949E] tracking-wider border-b border-[#353C48] pb-1.5 mb-1 select-none">
                  Previous Studies
                </h3>
                
                {/* List of Previous Studies Cards */}
                <div className="flex flex-col gap-1.5">
                  {[
                    { year: '2026', desc: 'CT Chest', inst: 'City Hospital', icon: <Calendar className="w-3 h-3 text-[#3B82F6]" /> },
                    { year: '2025', desc: 'MRI Brain', inst: 'Neurological Inst', icon: <Calendar className="w-3 h-3 text-[#8B949E]" /> },
                    { year: '2024', desc: 'PET CT', inst: 'Cancer Center', icon: <Calendar className="w-3 h-3 text-[#8B949E]" /> }
                  ].map((std, index) => (
                    <div 
                      key={index}
                      className="p-2.5 rounded-[6px] bg-[#252B34] border border-[#353C48] hover:border-[#4B5563] flex justify-between items-center transition-subtle"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-white text-[12px]">{std.desc}</span>
                        <span className="text-[11px] text-[#8B949E]">{std.inst}</span>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0 select-none">
                        <span className="text-[10px] font-bold text-[#8B949E] uppercase">{std.year}</span>
                        <span className="text-[#8B949E]">{std.icon}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Comparison Studies Selection (UI Placeholder) */}
              <div className="flex flex-col gap-2 mt-1">
                <h3 className="font-sans font-bold text-[10px] uppercase text-[#8B949E] tracking-wider border-b border-[#353C48] pb-1.5 mb-1 select-none">
                  Comparison Studies Selection
                </h3>
                <div className="p-2 rounded-[6px] bg-[#252B34]/60 border border-[#353C48] text-center text-[#8B949E] text-[11px] italic leading-relaxed select-none">
                  Select previous historical studies to align timelines side by side.
                </div>
              </div>

            </div>
          )}

        </div>
      )}

      {/* DRAGGABLE RESIZE HANDLE (Hidden when collapsed) */}
      {!isCollapsed && (
        <div 
          onMouseDown={handleMouseDown}
          className="absolute right-0 top-0 w-[4px] h-full hover:bg-[#3B82F6]/70 cursor-col-resize z-40 transition-colors duration-150 active:bg-[#3B82F6]"
          role="separator"
          aria-label="Resize Handle"
        />
      )}

      {/* Series Context Menu */}
      {contextMenu && (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed bg-[#1C1F26] border border-[#353C48] rounded-[4px] shadow-[0_8px_24px_rgba(0,0,0,0.5)] py-1 min-w-[160px] z-[9999] font-sans text-[12px] text-[#C9D1D9]"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopyShareLink?.();
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#2E7DFF] hover:text-white transition-colors cursor-pointer outline-none flex items-center"
          >
            Copy Share Link
          </button>
        </div>
      )}

      {studyContextMenu && (
        <div
          style={{ top: `${studyContextMenu.y}px`, left: `${studyContextMenu.x}px` }}
          className="fixed bg-[#1C1F26] border border-[#353C48] rounded-[4px] shadow-[0_8px_24px_rgba(0,0,0,0.5)] py-1 min-w-[160px] z-[9999] font-sans text-[12px] text-[#C9D1D9]"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShareStudy?.();
              setStudyContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#2E7DFF] hover:text-white transition-colors cursor-pointer outline-none flex items-center"
          >
            Share Study
          </button>
        </div>
      )}

    </div>
  );
}
