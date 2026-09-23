import React, { useState } from 'react';

export default function ReportBody() {
  const [examination, setExamination] = useState('MRI CARDIAC');
  const [reportText, setReportText] = useState(`Multiple plain axial cranial computed tomography of the head was done.\nExamination shows the following findings:\n\n- Midline structures are not displaced.\n- Ventricles are not dilated.\n- No intra-parenchymal mass/ fluid collection/ hypo-density/hyper-density noted.\n- Gray white matter interface is intact.\n- No hyper-dense/hypo-dense lesions in the subarachnoid, subdural and epidural spaces.\n- Sella and suprasellar structures are intact.\n- Posterior fossa structures are intact.\n- Left maxillary sinus is partially opacified.`);
  const [remarksText, setRemarksText] = useState(`- No gross skull fracture noted.\n- No acute intracranial bleed noted.\n- Maxillary sinusitis, left.`);

  return (
    <div className="flex flex-col text-[11px] text-black mb-6 flex-1 h-full">
      <div className="flex gap-x-2 font-bold mb-4 items-center">
        <span>EXAMINATION:</span>
        <input 
          type="text" 
          className="underline uppercase font-bold outline-none flex-1 bg-transparent hover:bg-yellow-50 focus:bg-yellow-50 transition-colors px-1 rounded print:hidden" 
          value={examination} 
          onChange={(e) => setExamination(e.target.value)} 
          placeholder="Enter examination type..."
        />
        <span className="hidden print:inline underline uppercase font-bold px-1">{examination}</span>
      </div>
      
      <div className="mb-2">
        <span className="font-bold block mb-1">CT SCAN REPORT:</span>
      </div>

      <textarea 
        className="w-full resize-none outline-none leading-normal hover:bg-yellow-50 focus:bg-yellow-50 transition-colors rounded p-1 flex-1 font-serif min-h-[220px] print:hidden"
        value={reportText}
        onChange={(e) => setReportText(e.target.value)}
        placeholder="Type your findings here..."
      />
      <div className="hidden print:block w-full leading-normal p-1 font-serif whitespace-pre-wrap">
        {reportText}
      </div>

      <div className="mt-2">
        <span className="font-bold italic block mb-1">Remarks:</span>
        <textarea 
          className="w-full resize-none outline-none font-bold italic leading-normal hover:bg-yellow-50 focus:bg-yellow-50 transition-colors rounded p-1 min-h-[80px] print:hidden"
          value={remarksText}
          onChange={(e) => setRemarksText(e.target.value)}
          placeholder="Type your remarks/impression here..."
        />
        <div className="hidden print:block w-full font-bold italic leading-normal p-1 whitespace-pre-wrap">
          {remarksText}
        </div>
      </div>
    </div>
  );
}
