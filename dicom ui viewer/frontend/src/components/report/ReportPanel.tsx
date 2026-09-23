import React from 'react';
import { Printer } from 'lucide-react';
import HospitalHeader from './HospitalHeader';
import PatientStudyHeader from './PatientStudyHeader';
import ReportBody from './ReportBody';
import ReportFooter from './ReportFooter';

interface ReportPanelProps {
  study: any;
}

export default function ReportPanel({ study }: ReportPanelProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col h-full bg-[#1C1F26] p-2 overflow-y-auto no-scrollbar rounded shadow-inner">
      <div className="flex justify-end mb-2 shrink-0 hide-on-print">
        <button 
          onClick={handlePrint}
          className="flex items-center gap-1.5 bg-[#2E7DFF] hover:bg-blue-600 text-white px-3 py-1.5 rounded text-[11px] font-bold transition-colors cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Save/Print PDF</span>
        </button>
      </div>

      {/* Paper Container - forced colors to ensure it stays white */}
      <div 
        id="print-report-container"
        className="p-4 rounded shadow-sm flex flex-col min-h-[500px] w-full font-serif mx-auto shrink-0"
        style={{ backgroundColor: '#ffffff', color: '#000000' }}
      >
        <HospitalHeader />
        <PatientStudyHeader study={study} />
        <ReportBody />
        <ReportFooter />
      </div>
    </div>
  );
}
