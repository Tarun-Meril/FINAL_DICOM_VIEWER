import React from 'react';
import { Plus, X } from 'lucide-react';

interface StudyTab {
  id: string;
  label: string;
}

interface ViewerTabBarProps {
  tabs: StudyTab[];
  activeTabId: string;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabAdd: () => void;
}

export default function ViewerTabBar({ tabs, activeTabId, onTabSelect, onTabClose, onTabAdd }: ViewerTabBarProps) {
  return (
    <div 
      className="flex items-center h-[32px] w-full bg-[#191D24] border-b border-[#1F232A] px-2 select-none justify-between shrink-0"
      role="tablist"
      aria-label="DICOM Study Tabs"
    >
      {/* Scrollable Tabs Wrapper */}
      <div className="flex items-center gap-[4px] h-full overflow-x-auto no-scrollbar max-w-[calc(100%-40px)]">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              onClick={() => onTabSelect(tab.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onTabSelect(tab.id);
                }
              }}
              className={`flex items-center h-[26px] gap-2 px-3 rounded-t-[4px] text-[11px] font-sans font-semibold border-t border-x cursor-pointer transition-all duration-150 outline-none shrink-0 ${
                isActive
                  ? 'bg-[#000000] border-[#1F232A] text-white'
                  : 'bg-transparent border-transparent text-[#8B949E] hover:text-white hover:bg-[#252B34]/30'
              }`}
            >
              <span className="truncate max-w-[120px]">{tab.label}</span>
              
              {/* Close Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
                className="flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-white/10 text-[#8B949E] hover:text-white transition-colors cursor-pointer outline-none"
                aria-label={`Close ${tab.label}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add Study (+) Button */}
      <button
        onClick={onTabAdd}
        title="Add DICOM Study"
        className="flex items-center justify-center w-[24px] h-[24px] rounded-[4px] hover:bg-[#252B34] border border-transparent hover:border-[#353C48] text-[#8B949E] hover:text-white cursor-pointer transition-all duration-150 shrink-0 outline-none"
      >
        <Plus className="w-4 h-4" />
      </button>

    </div>
  );
}
