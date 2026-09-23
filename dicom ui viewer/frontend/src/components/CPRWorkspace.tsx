import React, { useState } from 'react';
import { HelpCircle, RefreshCw, Layers } from 'lucide-react';
import { clinicalFacade } from '../clinical';
import { Vector3 } from '../3d/math/Vector3';

export default function CPRWorkspace() {
  const [selectedVessel, setSelectedVessel] = useState('LAD Coronary Artery');
  const [analysis, setAnalysis] = useState(() => {
    return clinicalFacade.startVascularWorkflow('LAD', 4.5, 1.5, [
      new Vector3(0, 0, 0),
      new Vector3(10, 10, 20),
      new Vector3(20, 5, 40)
    ]);
  });

  const handleRecalculate = () => {
    clinicalFacade.cprEngine.editor.clearCenterline();
    clinicalFacade.cprEngine.editor.addPoint(new Vector3(0, 0, 0));
    clinicalFacade.cprEngine.editor.addPoint(new Vector3(10, 10, 20));
    clinicalFacade.cprEngine.editor.addPoint(new Vector3(20, 5, 40));
    const res = clinicalFacade.startVascularWorkflow(selectedVessel, 4.5, 1.5, [
      new Vector3(0, 0, 0),
      new Vector3(10, 10, 20),
      new Vector3(20, 5, 40)
    ]);
    setAnalysis(res);
  };

  return (
    <div className="flex h-full w-full bg-[#000000] text-[#8B949E] select-none font-sans overflow-hidden">
      
      {/* 1. Left controls panel (Vessel selector details) */}
      <div className="w-[180px] bg-[#14181E] border-r border-[#1F232A] flex flex-col p-3 gap-3 shrink-0">
        <h3 className="font-bold text-[10px] uppercase text-[#8B949E] tracking-wider border-b border-[#1F232A] pb-1.5 select-none">
          Vessel Tracking
        </h3>
        
        <div className="flex flex-col gap-1 text-[11px]">
          <span className="text-[#666666]">Active Centerline</span>
          <select 
            value={selectedVessel}
            onChange={(e) => {
              setSelectedVessel(e.target.value);
              handleRecalculate();
            }}
            className="bg-[#1C1F26] border border-[#353C48] rounded-[3px] text-white px-1 py-1 outline-none text-[11px] cursor-pointer"
          >
            <option value="LAD Coronary Artery">LAD Coronary Artery</option>
            <option value="RCA Coronary Artery">RCA Coronary Artery</option>
            <option value="Abdominal Aorta">Abdominal Aorta</option>
            <option value="Carotid Artery Left">Carotid Artery Left</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5 text-[11px] border-t border-[#1F232A] pt-2">
          <span className="text-[#666666]">Tracking Mode</span>
          <label className="flex items-center gap-1.5 text-white cursor-pointer select-none">
            <input type="radio" name="track" defaultChecked className="accent-[#2E7DFF]" />
            <span>Auto-Centerline</span>
          </label>
          <label className="flex items-center gap-1.5 text-white cursor-pointer select-none">
            <input type="radio" name="track" className="accent-[#2E7DFF]" />
            <span>Manual Spline</span>
          </label>
        </div>

        <div className="flex flex-col gap-1 text-[11px] border-t border-[#1F232A] pt-2">
          <span className="text-[#666666]">Lumen Diameter</span>
          <div className="text-white font-mono-numbers text-[10.5px]">Ø {analysis.minimumDiameterMm.toFixed(1)} mm (Min)</div>
        </div>

        <button 
          onClick={handleRecalculate}
          className="mt-auto w-full bg-[#1C1F26] hover:bg-[#20252D] text-[11px] text-white border border-[#353C48] rounded-[3px] py-1.5 flex items-center justify-center gap-1 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Recalculate Path</span>
        </button>
      </div>

      {/* 2. Main Reconstruction viewports (Stretchable area) */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <div className="h-7 bg-[#14181E] border-b border-[#1F232A] px-3 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-white uppercase tracking-wider">
            CPR Workspace - Curved Planar Reconstruction
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-green-500 font-medium">Auto-Vessel Locked</span>
            <HelpCircle className="w-4 h-4 text-[#666666] cursor-help" />
          </div>
        </div>

        {/* Workspace views */}
        <div className="flex-1 flex gap-1 p-1 min-h-0 min-w-0">
          
          {/* Viewport 1: Curved Projection */}
          <div className="flex-1 bg-black border border-[#1F232A] relative flex items-center justify-center">
            {/* Corner tags */}
            <span className="absolute top-2 left-3 text-[10px] font-semibold text-white/80">CURVED RECONSTRUCTION</span>
            <span className="absolute top-2 right-3 text-[9px] text-[#666]">LAD PATH</span>
            
            {/* Mock Curved scan diagram */}
            <div className="w-[85%] h-12 border-y border-dashed border-[#353C48] flex items-center justify-center relative">
              {/* Vessel centerline line */}
              <svg className="absolute inset-0 w-full h-full">
                <path 
                  d="M 10 24 Q 100 8, 200 40 T 400 24 T 600 24" 
                  fill="none" 
                  stroke="#FF3B30" 
                  strokeWidth="1.2" 
                  strokeDasharray="4 2"
                />
                <path 
                  d="M 10 24 Q 100 8, 200 40 T 400 24 T 600 24" 
                  fill="none" 
                  stroke="#4C8DFF" 
                  strokeWidth="8" 
                  className="opacity-15"
                />
              </svg>
              <span className="text-[9px] text-[#444] font-semibold tracking-wide z-10 uppercase">Vessel Lumen Profile</span>
            </div>
          </div>

          {/* Viewport 2: Cross Section (Lumen details) */}
          <div className="w-[280px] bg-black border border-[#1F232A] relative flex flex-col shrink-0">
            <span className="absolute top-2 left-3 text-[10px] font-semibold text-white/80">LUMEN CROSS SECTIONS</span>
            
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
              {/* Lumen circle */}
              <div className="relative w-28 h-28 border border-[#222] rounded-full flex items-center justify-center">
                {/* Outer vessel wall */}
                <div className="w-[84px] h-[84px] border-2 border-dashed border-[#4C8DFF]/40 rounded-full flex items-center justify-center">
                  {/* Lumen wall */}
                  <div className="w-12 h-12 border border-red-500 fill-none rounded-full flex items-center justify-center bg-red-500/10">
                    <div className="w-2 h-2 bg-red-500 rounded-full" />
                  </div>
                </div>
                {/* Stats indicators */}
                <span className="absolute top-1 text-[8px] text-[#666]">OUTER WALL</span>
                <span className="absolute bottom-1 text-[8px] text-red-500">LUMEN INTIMA</span>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-[#A8A8A8] w-[200px]">
                <div>Reference Area:</div>
                <div className="text-white font-mono-numbers">{(Math.PI * Math.pow(analysis.referenceDiameterMm / 2, 2)).toFixed(1)} mm²</div>
                <div>Stenosis Ratio:</div>
                <div className="text-red-500 font-mono-numbers">{analysis.diameterStenosisPercentage.toFixed(1)}% ({analysis.severityCategory})</div>
                <div>Flow Area:</div>
                <div className="text-green-500 font-mono-numbers font-semibold">{(Math.PI * Math.pow(analysis.minimumDiameterMm / 2, 2)).toFixed(1)} mm²</div>
              </div>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
