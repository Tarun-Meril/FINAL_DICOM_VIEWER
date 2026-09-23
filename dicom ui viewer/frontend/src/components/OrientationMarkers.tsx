import React from 'react';

interface OrientationMarkersProps {
  top: string;
  bottom: string;
  left: string;
  right: string;
}

export default function OrientationMarkers({ top, bottom, left, right }: OrientationMarkersProps) {
  return (
    <div className="absolute inset-0 pointer-events-none select-none font-sans font-normal text-[10px] text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,1)] z-20">
      
      {/* Top Marker */}
      <div className="absolute top-2 left-1/2 transform -translate-x-1/2 leading-none uppercase">
        {top}
      </div>

      {/* Bottom Marker */}
      <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 leading-none uppercase">
        {bottom}
      </div>

      {/* Left Marker */}
      <div className="absolute left-2.5 top-1/2 transform -translate-y-1/2 leading-none uppercase">
        {left}
      </div>

      {/* Right Marker */}
      <div className="absolute right-2.5 top-1/2 transform -translate-y-1/2 leading-none uppercase">
        {right}
      </div>

    </div>
  );
}
