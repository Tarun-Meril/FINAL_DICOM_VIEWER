import React from 'react';
import { Database, FolderOpen, RefreshCcw, HardDrive } from 'lucide-react';

interface EmptyViewerStateProps {
  onLoadSample: () => void;
}

export default function EmptyViewerState({ onLoadSample }: EmptyViewerStateProps) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 h-full bg-[#000000] text-[#A8A8A8] font-sans p-6 select-none border border-[#1F232A]">
      
      {/* Workstation Scanner Icon Overlay */}
      <div className="relative w-20 h-20 mb-6 text-[#A8A8A8]/40 flex items-center justify-center">
        {/* scanner ring outer */}
        <div className="absolute w-20 h-20 border-4 border-dashed border-current rounded-full animate-[spin_40s_linear_infinite]" />
        {/* scanner ring inner */}
        <div className="absolute w-14 h-14 border border-dotted border-current rounded-full" />
        {/* central scanner line */}
        <div className="w-1.5 h-12 bg-current rounded-full rotate-45 opacity-60" />
      </div>

      {/* Main Labels */}
      <h2 className="text-[20px] font-semibold text-white tracking-wide mb-1">
        No Study Loaded
      </h2>
      <p className="text-[14px] text-[#A8A8A8] text-center max-w-[320px] mb-6 leading-relaxed">
        Open a DICOM Study or Drag & Drop DICOM Files Here
      </p>

      {/* Action shortcuts / import buttons */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-8 max-w-[480px]">
        <button
          onClick={onLoadSample}
          className="flex items-center gap-2 px-4 py-2 bg-[#252B34] border border-[#353C48] rounded-[4px] text-[12px] font-medium text-white hover:bg-[#2A323D] hover:border-[#4B5563] cursor-pointer transition-all duration-150 outline-none"
        >
          <FolderOpen className="w-4 h-4 text-[#3B82F6]" />
          <span>Load Sample Study</span>
        </button>

        <button
          onClick={onLoadSample}
          className="flex items-center gap-2 px-4 py-2 bg-[#252B34] border border-[#353C48] rounded-[4px] text-[12px] font-medium text-white hover:bg-[#2A323D] hover:border-[#4B5563] cursor-pointer transition-all duration-150 outline-none"
        >
          <Database className="w-4 h-4 text-[#3B82F6]" />
          <span>Local DB</span>
        </button>

        <button
          onClick={onLoadSample}
          className="flex items-center gap-2 px-4 py-2 bg-[#252B34] border border-[#353C48] rounded-[4px] text-[12px] font-medium text-white hover:bg-[#2A323D] hover:border-[#4B5563] cursor-pointer transition-all duration-150 outline-none"
        >
          <HardDrive className="w-4 h-4 text-[#3B82F6]" />
          <span>PACS Import</span>
        </button>
      </div>

      {/* Supported formats legend */}
      <div className="border-t border-[#1F232A] pt-4 w-full max-w-[360px] text-center">
        <span className="text-[10px] font-bold text-[#666666] uppercase tracking-widest block mb-2">
          Supported Formats
        </span>
        <div className="flex justify-center gap-4 text-[11px] font-semibold text-[#888888] font-mono">
          <span>DICOM</span>
          <span className="text-[#353C48]">•</span>
          <span>DICOMDIR</span>
          <span className="text-[#353C48]">•</span>
          <span>ZIP Archive</span>
        </div>
      </div>

    </div>
  );
}
