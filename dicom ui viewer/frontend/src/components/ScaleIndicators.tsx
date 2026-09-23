import React from 'react';

export function VerticalScale() {
  return (
    <div className="absolute left-[36px] top-1/2 transform -translate-y-1/2 flex items-center gap-1 pointer-events-none select-none z-10">
      {/* Outlined Green Scale Ruler */}
      <svg 
        width="10" 
        height="120" 
        viewBox="0 0 10 120" 
        fill="none" 
        className="stroke-green-500/90 drop-shadow-[0_1px_2px_rgba(0,0,0,1)]"
      >
        {/* Main Vertical Spine */}
        <line x1="8" y1="0" x2="8" y2="120" strokeWidth="1.2" />
        
        {/* Major Top End Tick */}
        <line x1="0" y1="0" x2="8" y2="0" strokeWidth="1" />
        
        {/* Minor ticks every 10px */}
        <line x1="4" y1="12" x2="8" y2="12" strokeWidth="1" />
        <line x1="4" y1="24" x2="8" y2="24" strokeWidth="1" />
        <line x1="4" y1="36" x2="8" y2="36" strokeWidth="1" />
        <line x1="4" y1="48" x2="8" y2="48" strokeWidth="1" />
        
        {/* Centered Mid Major Tick */}
        <line x1="1" y1="60" x2="8" y2="60" strokeWidth="1.2" />
        
        {/* Minor ticks second half */}
        <line x1="4" y1="72" x2="8" y2="72" strokeWidth="1" />
        <line x1="4" y1="84" x2="8" y2="84" strokeWidth="1" />
        <line x1="4" y1="96" x2="8" y2="96" strokeWidth="1" />
        <line x1="4" y1="108" x2="8" y2="108" strokeWidth="1" />
        
        {/* Major Bottom End Tick */}
        <line x1="0" y1="120" x2="8" y2="120" strokeWidth="1" />
      </svg>
      
      {/* 5cm label marker */}
      <span className="font-mono text-[9px] font-normal text-green-500/90 leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
        5 cm
      </span>
    </div>
  );
}

export function HorizontalScale() {
  return (
    <div className="absolute bottom-[36px] left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none select-none z-10">
      {/* Outlined Green Horizontal Ruler */}
      <svg 
        width="120" 
        height="10" 
        viewBox="0 0 120 10" 
        fill="none" 
        className="stroke-green-500/90 drop-shadow-[0_1px_2px_rgba(0,0,0,1)]"
      >
        {/* Main Horizontal Spine */}
        <line x1="0" y1="8" x2="120" y2="8" strokeWidth="1.2" />
        
        {/* Major Left End Tick */}
        <line x1="0" y1="0" x2="0" y2="8" strokeWidth="1" />
        
        {/* Minor ticks every 12px */}
        <line x1="12" y1="4" x2="12" y2="8" strokeWidth="1" />
        <line x1="24" y1="4" x2="24" y2="8" strokeWidth="1" />
        <line x1="36" y1="4" x2="36" y2="8" strokeWidth="1" />
        <line x1="48" y1="4" x2="48" y2="8" strokeWidth="1" />
        
        {/* Centered Mid Major Tick */}
        <line x1="60" y1="1" x2="60" y2="8" strokeWidth="1.2" />
        
        {/* Minor ticks second half */}
        <line x1="72" y1="4" x2="72" y2="8" strokeWidth="1" />
        <line x1="84" y1="4" x2="84" y2="8" strokeWidth="1" />
        <line x1="96" y1="4" x2="96" y2="8" strokeWidth="1" />
        <line x1="108" y1="4" x2="108" y2="8" strokeWidth="1" />
        
        {/* Major Right End Tick */}
        <line x1="120" y1="0" x2="120" y2="8" strokeWidth="1" />
      </svg>
      
      {/* 10cm label marker */}
      <span className="font-mono text-[9px] font-normal text-green-500/90 leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
        10 cm
      </span>
    </div>
  );
}
