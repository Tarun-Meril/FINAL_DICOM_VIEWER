import React from 'react';
import logo from '../../logo.png'; // Assuming logo is in src/

export default function HospitalHeader() {
  return (
    <div className="flex flex-col items-center border-b-[1.5px] border-black pb-2 mb-3">
      <div className="flex items-center gap-3 mb-1">
        <img src={logo} alt="Meril Logo" className="filter invert" style={{ height: '32px', width: 'auto', objectFit: 'contain' }} />
        <h1 className="text-[16px] font-bold uppercase tracking-wider text-black">MERIL LIFE SCIENCE</h1>
      </div>
      <p className="text-[10px] italic text-black">"Quality medical care within your reach"</p>
      <p className="text-[10px] text-black">Muktanand Marg, Chala, Vapi, Gujarat 396191</p>
      <p className="text-[10px] text-black">Phone: +91 260 305 2100</p>
      <p className="text-[10px] text-black font-semibold">info@merillife.com</p>
    </div>
  );
}
