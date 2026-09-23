import React from 'react';
import { Upload } from 'lucide-react';

export default function DragDropOverlay() {
  return (
    <div className="absolute inset-0 bg-[#000000]/85 border-2 border-dashed border-[#2E7DFF] m-3 rounded-[6px] z-50 flex flex-col items-center justify-center font-sans pointer-events-none select-none animate-[pulse_2s_infinite]">
      
      {/* Upload icon */}
      <div className="w-12 h-12 rounded-full bg-[#2E7DFF]/10 flex items-center justify-center text-[#2E7DFF] mb-4 border border-[#2E7DFF]/30">
        <Upload className="w-6 h-6 animate-bounce" />
      </div>

      {/* Upload instructions */}
      <h3 className="text-white text-[16px] font-semibold tracking-wide mb-1">
        Drop DICOM Files Here
      </h3>
      <p className="text-[12px] text-[#2E7DFF]">
        Import studies instantly into the workstation viewer
      </p>

    </div>
  );
}
