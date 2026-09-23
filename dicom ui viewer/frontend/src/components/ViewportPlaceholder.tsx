import React from 'react';
import { FolderClosed } from 'lucide-react';

export default function ViewportPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-[#000000] text-[#8B949E] p-4 select-none pointer-events-none">
      
      {/* Subtle scanner/folder outline icon */}
      <div className="w-10 h-10 mb-3 text-[#353C48] flex items-center justify-center border border-dashed border-[#353C48] rounded-full shrink-0">
        <FolderClosed className="w-4 h-4 text-[#353C48]" />
      </div>

      {/* Spacers and instructional text */}
      <span className="font-sans font-medium text-[11px] text-[#A8A8A8] leading-none mb-1 text-center">
        Drop Series Here
      </span>
      <span className="font-sans text-[10px] text-[#666666] leading-none text-center">
        or Double-click a Series
      </span>

    </div>
  );
}
