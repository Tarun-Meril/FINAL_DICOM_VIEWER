import React from 'react';

export default function ReportFooter() {
  return (
    <div className="flex flex-col text-[10px] text-black mt-auto pt-6">
      <div className="self-end text-center mb-6 mr-4">
        {/* Signature Line */}
        <div className="h-8 mb-1 border-b border-black w-48 mx-auto flex items-end justify-center pb-1">
           <span className="font-serif italic text-gray-500 text-sm">e-Signed</span>
        </div>
        <p className="font-bold text-[11px]">Ma. Cecille C. Angelia, MD FAFN FPCS</p>
        <p className="italic">NEUROSURGEON</p>
        <p>License No: 70406</p>
      </div>

      <div className="font-bold mb-1 text-[11px]">Thank you for your kind referral</div>
      <p className="italic text-[9px] text-gray-800 leading-tight mb-3">
        This was read by a neurosurgeon. Dr Cecille is a UP College of Medicine Graduate, UPPGH trained neurosurgeon and Fellow of the Academy of Filipino Neurosurgeons.
      </p>
      <p className="italic text-[8px] text-gray-600 leading-tight">
        This is based entirely on radiologic findings and should be correlated with clinical, other roentgenological and laboratory findings. Radiologist reading available upon request. Reading fee may be charged.
      </p>
    </div>
  );
}
