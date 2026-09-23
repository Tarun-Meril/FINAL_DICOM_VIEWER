import React, { useEffect, useState } from 'react';

export default function LoadingOverlay() {
  const [progress, setProgress] = useState(0);

  // Animate mock study load progress bar
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 10;
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute inset-0 bg-[#000000]/80 z-50 flex flex-col items-center justify-center font-sans select-none pointer-events-auto">
      
      {/* Loading Label */}
      <span className="text-[13px] font-medium text-white tracking-wide mb-3">
        Loading DICOM Study...
      </span>

      {/* Progress Bar Container */}
      <div className="w-[200px] h-[3px] bg-[#1F232A] rounded-full overflow-hidden mb-1.5">
        <div 
          className="h-full bg-[#2E7DFF] transition-all duration-100 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Progress percentage text */}
      <span className="text-[10px] font-mono font-bold text-[#888888] tracking-widest uppercase">
        {progress}% Loaded
      </span>

    </div>
  );
}
