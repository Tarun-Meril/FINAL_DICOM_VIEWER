import React from 'react';

interface PatientStudyHeaderProps {
  study: any;
}

export default function PatientStudyHeader({ study }: PatientStudyHeaderProps) {
  // Use data from study if available, else placeholders
  const patientName = study?.patientName || 'Caraan, Michael F.';
  // Calculate or extract age/sex from study if available
  const patientAgeSex = study?.patientAge ? `${study.patientAge}/${study.patientSex || 'U'}` : '61Y/F';
  const ctNo = study?.accessionNumber || '25-001208';
  const date = study?.studyDate || 'April 11, 2025';
  const address = 'Bigain 2nd, San Jose, Batangas';
  const requestedBy = study?.referringPhysicianName || 'Dr. Sarah Smith';

  return (
    <div className="flex flex-col text-[11px] text-black mb-4 pb-2 border-b-[1.5px] border-black">
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 gap-y-1 font-bold mb-1.5 items-baseline">
        <span className="whitespace-nowrap">Name:</span>
        <span className="truncate">{patientName}</span>
        
        <span className="whitespace-nowrap pl-2 border-l border-gray-400">{patientAgeSex}</span>
      </div>
      
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 font-bold mb-1.5">
        <span className="whitespace-nowrap">CT No. / Accession:</span>
        <span>{ctNo}</span>
        
        <span className="whitespace-nowrap">Date:</span>
        <span>{date}</span>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 leading-snug mt-1">
        <span className="text-black font-semibold">Address:</span>
        <span>{address}</span>
        
        <span className="text-black font-semibold">Requested by:</span>
        <span>{requestedBy}</span>
      </div>
    </div>
  );
}
