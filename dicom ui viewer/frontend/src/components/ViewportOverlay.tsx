import React from 'react';
import OrientationMarkers from './OrientationMarkers';
import { VerticalScale, HorizontalScale } from './ScaleIndicators';

export interface ViewportOverlayData {
  patientName: string;
  patientId: string;
  age: string;
  gender: string;
  studyDescription: string;
  studyDate: string;
  studyTime: string;
  seriesNumber: number;
  imageNumber: number;
  totalImages: number;
  zoom: string;
  sliceThickness: string;
  compression: string;
  windowWidth: number;
  windowLevel: number;
  resolution: string;
  plane: string;
  orientation: {
    top: string;
    bottom: string;
    left: string;
    right: string;
  };
  spacing?: string;
}

interface ViewportOverlayProps {
  data: ViewportOverlayData;
  viewportNum: number;
  active: boolean;
  readOnly?: boolean;
}

export default function ViewportOverlay({ data, viewportNum, active, readOnly }: ViewportOverlayProps) {
  return (
    <div className="absolute inset-0 p-2 sm:p-3 pointer-events-none select-none font-sans font-normal text-[8.5px] xs:text-[9.5px] sm:text-[10px] text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,1)] z-10 overflow-hidden">
      
      {/* 1. TOP LEFT OVERLAY - Viewport Identifier & Patient Specs */}
      <div className="absolute top-1.5 sm:top-2 left-2 sm:left-3 flex flex-col gap-0.5 max-w-[42%] sm:max-w-[180px] md:max-w-[200px] text-left">
        {/* Small blue identifier tag */}
        <span className={`text-[8px] xs:text-[9px] sm:text-[9.5px] font-semibold uppercase tracking-wider mb-0.5 select-none leading-none ${
          active ? 'text-[#2E7DFF]' : 'text-[#8B949E]'
        }`}>
          V-{viewportNum}
        </span>
        <span className="text-white/95 select-text truncate" title={data.patientName}>{data.patientName}</span>
        <span className="font-mono-numbers select-text truncate">{data.patientId}</span>
        <span className="select-text truncate">{data.age} / {data.gender}</span>
      </div>

      {/* 2. TOP RIGHT OVERLAY - Study Identifier */}
      <div className="absolute top-1.5 sm:top-2 right-2 sm:right-3 flex flex-col items-end gap-0.5 max-w-[42%] sm:max-w-[180px] md:max-w-[200px] text-right">
        <span className="text-white/95 select-text truncate max-w-full" title={data.studyDescription}>
          {data.studyDescription}
        </span>
        <span className="font-mono-numbers select-text truncate">{data.studyDate}</span>
        <span className="font-mono-numbers select-text truncate">{data.studyTime}</span>
      </div>

      {/* 3. BOTTOM LEFT OVERLAY - Series Specs & Acquisition stats */}
      <div className="absolute bottom-1.5 sm:bottom-2 left-2 sm:left-3 flex flex-col gap-0.5 max-w-[42%] sm:max-w-[180px] md:max-w-[200px] text-left">
        <span className="font-mono-numbers truncate">Ser: {data.seriesNumber}</span>
        <span className="font-mono-numbers truncate">Img: {data.imageNumber} / {data.totalImages}</span>
        <span className="truncate">Thk: {data.sliceThickness}</span>
        {data.spacing && <span className="font-mono-numbers truncate">Spc: {data.spacing}</span>}
        <span className="font-mono-numbers truncate">Zoom: {data.zoom}</span>
        <span className="truncate">{data.compression}</span>
      </div>

      {/* 4. BOTTOM RIGHT OVERLAY - Visual processing settings */}
      <div className="absolute bottom-1.5 sm:bottom-2 right-2 sm:right-3 flex flex-col items-end gap-0.5 max-w-[42%] sm:max-w-[180px] md:max-w-[200px] text-right">
        <span className="font-mono-numbers truncate">WW: {data.windowWidth}</span>
        <span className="font-mono-numbers truncate">WL: {data.windowLevel}</span>
        <span className="font-mono-numbers truncate">{data.resolution}</span>
        <span className="text-white/95 select-text truncate">{data.plane}</span>
      </div>

      {/* 5. ANATOMICAL ORIENTATION MARKERS */}
      <OrientationMarkers 
        top={data.orientation.top}
        bottom={data.orientation.bottom}
        left={data.orientation.left}
        right={data.orientation.right}
      />

      {/* 6. GREEN MEDICAL SCALE RULERS */}
      <VerticalScale />
      <HorizontalScale />

      {/* 7. READ ONLY OVERLAY BADGE */}
      {readOnly && (
        <div className="absolute top-1.5 sm:top-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <span className="bg-[#EF4444] text-white text-[8.5px] xs:text-[9.5px] font-sans font-bold px-1.5 sm:px-2 py-0.5 rounded shadow-[0_2px_8px_rgba(0,0,0,0.5)] tracking-wider">
            READ ONLY
          </span>
        </div>
      )}

    </div>
  );
}
