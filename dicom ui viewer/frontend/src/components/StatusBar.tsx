import React, { useEffect, useState } from 'react';

export interface ViewportStats {
  imageIndex: number;
  totalImages: number;
  zoom: string;
  windowWidth: number;
  windowLevel: number;
  resolution: string;
  spacing: string;
  plane: string;
}

interface StatusBarProps {
  stats: ViewportStats;
  activeTool: string;
  layout: string;
}

export default function StatusBar({ stats, activeTool, layout }: StatusBarProps) {
  const [statusMsg, setStatusMsg] = useState('Ready');
  const [loadingProgress, setLoadingProgress] = useState<number | null>(null);

  // Parse display label for tools
  const getToolDisplayName = (tool: string) => {
    switch (tool) {
      case 'pan': return 'Pan';
      case 'zoom': return 'Zoom';
      case 'wl': return 'Window / Level';
      case 'scroll': return 'Stack Scroll';
      case 'select': return 'Select / Edit';
      case 'length': return 'Linear Measure';
      case 'angle': return 'Angle Measure';
      case 'rect': return 'Rectangle ROI';
      case 'ellipse': return 'Ellipse ROI';
      case 'polygon': return 'Polygon ROI';
      case 'freehand': return 'Freehand ROI';
      case 'text': return 'Text Annotation';
      case 'arrow': return 'Arrow Pointer';
      default: return 'Ready';
    }
  };

  // Simulates loader progress when study is switched / loaded
  useEffect(() => {
    if (stats.imageIndex === 63 && stats.totalImages === 183 && stats.windowWidth === 400) {
      // Ignore initial load or reset
      return;
    }
    // Simulate study loading pipeline status changes
    setStatusMsg('Loading Study...');
    setLoadingProgress(10);
    
    const t1 = setTimeout(() => {
      setLoadingProgress(45);
    }, 150);
    const t2 = setTimeout(() => {
      setLoadingProgress(80);
    }, 300);
    const t3 = setTimeout(() => {
      setLoadingProgress(null);
      setStatusMsg('Import Complete');
    }, 450);
    const t4 = setTimeout(() => {
      setStatusMsg('Ready');
    }, 2000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [stats.totalImages, stats.resolution]);

  return (
    <footer 
      className="h-[26px] bg-[#202225] border-t border-[#30343A] px-3 flex items-center justify-between text-[11px] font-sans text-[#8B949E] select-none shrink-0 w-full z-40"
      role="contentinfo"
      aria-label="PACS Workspace Status Bar"
    >
      
      {/* 1. LEFT SECTION - Tool & Status messages */}
      <div className="flex items-center gap-3 min-w-[220px]">
        {/* Active Tool */}
        <div className="flex items-center gap-1.5 border-r border-[#30343A]/50 pr-3 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#2E7DFF] shrink-0" />
          <span className="text-white font-medium">{getToolDisplayName(activeTool)}</span>
        </div>

        {/* Status Message Reserve */}
        <div className="flex items-center gap-2">
          <span className={`transition-all duration-150 ${
            statusMsg.startsWith('Loading') ? 'text-yellow-500 font-medium' : 'text-[#8B949E]'
          }`}>
            {statusMsg}
          </span>
          
          {/* Loading Progress bar indicator */}
          {loadingProgress !== null && (
            <div className="flex items-center gap-1">
              <span className="font-mono text-[9px] text-[#555]">
                {loadingProgress}%
              </span>
              <div className="w-16 bg-[#181A1F] h-1.5 rounded-sm overflow-hidden border border-[#30343A]">
                <div 
                  className="bg-yellow-500 h-full transition-all duration-75"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. CENTER SECTION - Viewport metrics */}
      <div className="flex items-center gap-6 justify-center text-center">
        <div className="flex items-center gap-1">
          <span>Image</span>
          <span className="text-white font-mono-numbers">{stats.imageIndex} / {stats.totalImages}</span>
        </div>
        <div className="flex items-center gap-1 border-l border-[#30343A]/50 pl-6">
          <span>Zoom</span>
          <span className="text-white font-mono-numbers">{stats.zoom}</span>
        </div>
        <div className="flex items-center gap-4 border-l border-[#30343A]/50 pl-6">
          <div className="flex items-center gap-1">
            <span>WW</span>
            <span className="text-white font-mono-numbers">{stats.windowWidth}</span>
          </div>
          <div className="flex items-center gap-1">
            <span>WL</span>
            <span className="text-white font-mono-numbers">{stats.windowLevel}</span>
          </div>
        </div>
      </div>

      {/* 3. RIGHT SECTION - Layout & Resolution & Hardware status space */}
      <div className="flex items-center gap-6 min-w-[280px] justify-end">
        {/* Hardware Status Reserves */}
        <div className="hidden lg:flex items-center gap-2 text-[10px] text-[#555] font-mono pr-4 border-r border-[#30343A]/50">
          <span>GPU: VRAM OK</span>
          <span>•</span>
          <span>MEM: 1.4 GB</span>
        </div>

        <div className="flex items-center gap-1 pr-6 border-r border-[#30343A]/50 font-mono-numbers">
          <span>{stats.resolution}</span>
          <span className="w-1 h-1 rounded-full bg-[#444]" />
          <span>{stats.spacing}</span>
        </div>

        <div className="flex items-center gap-1.5 font-mono-numbers font-medium text-white">
          <span>{layout.split(' ')[0]}</span>
        </div>
      </div>

    </footer>
  );
}
