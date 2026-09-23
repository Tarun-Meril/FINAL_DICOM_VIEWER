import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { X, Copy, QrCode, ExternalLink, Link, Key, Calendar, ShieldAlert } from 'lucide-react';
import { API_BASE_URL } from '../config';

// Port 3001 is where our Node.js Share Study APIs run
const SHARE_API_BASE_URL = import.meta.env.VITE_SHARE_API_BASE_URL || 'http://localhost:3001';

const copyTextFallback = (text: string): boolean => {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.top = '0';
  textArea.style.left = '0';
  textArea.style.position = 'fixed';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  let success = false;
  try {
    success = document.execCommand('copy');
  } catch (err) {
    console.error('Fallback copy failed', err);
  }
  document.body.removeChild(textArea);
  return success;
};

interface ShareDialogProps {
  study: any | null;
  onClose: () => void;
  onOpenManageShares: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function ShareDialog({ study, onClose, onOpenManageShares, showToast }: ShareDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  
  // Expiration State
  const [expiration, setExpiration] = useState<string>('24h'); // '24h', '7d', '30d', 'never'
  
  // Password State
  const [password, setPassword] = useState<string>('');
  const [showPasswordInput, setShowPasswordInput] = useState<boolean>(false);
  
  // Detail Checkbox Permissions
  const [viewImages, setViewImages] = useState<boolean>(true);
  const [windowLevel, setWindowLevel] = useState<boolean>(true);
  const [zoom, setZoom] = useState<boolean>(true);
  const [pan, setPan] = useState<boolean>(true);
  const [scroll, setScroll] = useState<boolean>(true);
  const [measurements, setMeasurements] = useState<boolean>(true);
  const [viewAnnotations, setViewAnnotations] = useState<boolean>(true);
  
  // Optional Extra Checkbox Permissions
  const [editAnnotations, setEditAnnotations] = useState<boolean>(false);
  const [downloadPdf, setDownloadPdf] = useState<boolean>(false);
  const [downloadDicom, setDownloadDicom] = useState<boolean>(false);

  // Result States
  const [loading, setLoading] = useState<boolean>(false);
  const [shareLink, setShareLink] = useState<string>('');
  const [tokenInfo, setTokenInfo] = useState<any>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [showQrCode, setShowQrCode] = useState<boolean>(false);
  const [showConfirmRegenerate, setShowConfirmRegenerate] = useState<boolean>(false);

  // Keyboard Navigation: Focus Dialog on Mount
  useEffect(() => {
    if (dialogRef.current) {
      dialogRef.current.focus();
    }
  }, []);

  // Global Keyboard listener inside modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter' && !loading && !shareLink) {
        // Prevent default form behavior and generate link
        e.preventDefault();
        handleGenerateLink();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, shareLink, expiration, password, viewImages, measurements, viewAnnotations, editAnnotations, downloadPdf, downloadDicom]);

  if (!study) {
    return (
      <div className="fixed inset-0 bg-black/75 z-[999] flex items-center justify-center p-4 backdrop-blur-xs select-none">
        <div className="bg-[#1C1F26] border border-[#353C48] rounded-[6px] shadow-2xl max-w-md w-full p-6 text-center text-[#C9D1D9]">
          <h2 className="text-lg font-bold text-white mb-2">No Study Loaded</h2>
          <p className="text-[13px] text-[#8B949E] mb-6">Please open or select a study from the list before attempting to share.</p>
          <button onClick={onClose} className="px-4 py-2 bg-[#252B34] border border-[#353C48] rounded hover:bg-[#2A323D] text-[12px] cursor-pointer transition-subtle">
            Close
          </button>
        </div>
      </div>
    );
  }

  // Calculate standard ISO expiration string
  const calculateExpiration = (): string | undefined => {
    if (expiration === 'never') return undefined;
    const now = new Date();
    if (expiration === '24h') now.setHours(now.getHours() + 24);
    else if (expiration === '7d') now.setDate(now.getDate() + 7);
    else if (expiration === '30d') now.setDate(now.getDate() + 30);
    return now.toISOString();
  };

  const handleGenerateLink = async () => {
    setLoading(true);
    try {
      const expiresAt = calculateExpiration();
      const payload = {
        study_uid: study.studyInstanceUid || study.study_instance_uid,
        permissions: {
          view: viewImages,
          measure: measurements,
          annotation: viewAnnotations || editAnnotations,
          download: downloadPdf || downloadDicom
        },
        expires_at: expiresAt,
        password: password.trim() || undefined,
        created_by: 'MedView Pro Workstation'
      };

      const res = await fetch(`${SHARE_API_BASE_URL}/api/share-study`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Server responded with an error');
      }

      // Format URL for sharing
      const token = data.token;
      let hostUrl = import.meta.env.VITE_SHARE_BASE_URL;
      if (!hostUrl) {
        if (window.location.origin && window.location.origin !== 'file://' && !window.location.origin.startsWith('chrome-extension')) {
          hostUrl = window.location.origin;
        } else {
          hostUrl = SHARE_API_BASE_URL.replace('3001', '3000');
        }
      }
      const generatedUrl = `${hostUrl}/share/${token}`;
      
      setShareLink(generatedUrl);
      setTokenInfo(data);
      
      // Generate QR Code Offline
      const qrDataUrl = await QRCode.toDataURL(generatedUrl, { width: 200, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
      setQrCodeDataUrl(qrDataUrl);

      showToast('Share Link Created');
    } catch (err: any) {
      console.error('Share generation failed:', err);
      showToast(err.message || 'API Server is offline', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareLink) return;
    try {
      if (window.electronAPI?.copyText) {
        await window.electronAPI.copyText(shareLink);
        showToast('Link Copied');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink);
        showToast('Link Copied');
      } else {
        const success = copyTextFallback(shareLink);
        if (success) showToast('Link Copied');
        else throw new Error('Fallback failed');
      }
    } catch (err) {
      try {
        const success = copyTextFallback(shareLink);
        if (success) {
          showToast('Link Copied');
          return;
        }
      } catch (innerErr) {
        console.error(innerErr);
      }
      showToast('Clipboard Copy Failed', 'error');
    }
  };

  const handleCopyQRCode = async () => {
    if (!qrCodeDataUrl) return;
    try {
      if (window.electronAPI?.copyImage) {
        await window.electronAPI.copyImage(qrCodeDataUrl);
        showToast('Link Copied'); // Map to 'Link Copied' or custom notification
      } else {
        showToast('Clipboard Failure', 'error');
      }
    } catch (err) {
      showToast('Clipboard Failure', 'error');
    }
  };

  const handleSaveQRCode = async () => {
    if (!qrCodeDataUrl) return;
    try {
      if (window.electronAPI?.saveImage) {
        const patientNameClean = (study.patientName || 'Structured_Report').replace(/[^a-zA-Z0-9]/g, '_');
        const defaultName = `share-qr-${patientNameClean}.png`;
        const success = await window.electronAPI.saveImage(qrCodeDataUrl, defaultName);
        if (success) {
          showToast('QR Saved');
        }
      } else {
        showToast('Clipboard Failure', 'error');
      }
    } catch (err) {
      showToast('Unexpected Error', 'error');
    }
  };

  const handlePrintQRCode = () => {
    if (!qrCodeDataUrl) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Print QR Code</title>
            <style>
              body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; font-family: sans-serif; background: #fff; color: #000; }
              .container { border: 2px solid #ccc; padding: 24px; border-radius: 8px; text-align: center; }
              img { width: 250px; height: 250px; }
              h3 { margin: 16px 0 8px; font-size: 18px; font-weight: bold; }
              p { margin: 0; font-size: 12px; color: #555; font-family: monospace; word-break: break-all; max-width: 300px; }
            </style>
          </head>
          <body onload="window.print(); window.close();">
            <div class="container">
              <img src="${qrCodeDataUrl}" />
              <h3>MedView Pro Study QR</h3>
              <p>${shareLink}</p>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const handleOpenExternal = () => {
    if (!shareLink) return;
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(shareLink);
    } else {
      window.open(shareLink, '_blank');
    }
  };

  const confirmRegenerateLink = () => {
    setShowConfirmRegenerate(true);
  };

  const handleRegenerate = async () => {
    setShowConfirmRegenerate(false);
    // Revoke old token if we have one
    if (tokenInfo?.token) {
      try {
        await fetch(`${SHARE_API_BASE_URL}/api/share/${tokenInfo.token}`, { method: 'DELETE' });
        showToast('Link Revoked');
      } catch (err) {
        console.error('Failed to revoke previous link:', err);
      }
    }
    // Generate new one
    await handleGenerateLink();
  };

  const formattedDate = study.studyDate || study.study_date
    ? `${(study.studyDate || study.study_date).substring(0, 4)}-${(study.studyDate || study.study_date).substring(4, 6)}-${(study.studyDate || study.study_date).substring(6, 8)}`
    : '-';

  return (
    <div className="fixed inset-0 bg-black/80 z-[999] flex items-center justify-center p-4 backdrop-blur-xs select-none">
      <div 
        ref={dialogRef}
        tabIndex={-1}
        className="bg-[#1C1F26] border border-[#353C48] rounded-[6px] shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden focus:outline-none focus:ring-1 focus:ring-[#3B82F6]/50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-share-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#17191E] border-b border-[#353C48]">
          <h2 id="dialog-share-title" className="text-sm font-bold text-white flex items-center gap-2">
            <Link className="w-4 h-4 text-[#3B82F6]" />
            Share Study
          </h2>
          <button 
            onClick={onClose} 
            title="Close Dialog (Esc)"
            className="text-[#8B949E] hover:text-white transition-colors cursor-pointer outline-none"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 no-scrollbar">
          
          {/* Patient / Study Metadata Card */}
          <div className="bg-[#14171C] border border-[#252B34] rounded-[4px] p-3 text-[12px] font-sans">
            <h3 className="text-[10px] font-bold text-[#8B949E] uppercase tracking-wider mb-2 border-b border-[#252B34] pb-1">Study Context</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-[#C9D1D9]">
              <div><span className="text-[#8B949E]">Patient Name:</span> <span className="font-semibold block truncate text-white">{study.patientName || study.patient_name}</span></div>
              <div><span className="text-[#8B949E]">Patient ID:</span> <span className="font-mono block truncate">{study.patientId || study.patient_id}</span></div>
              <div><span className="text-[#8B949E]">Modality:</span> <span className="block text-[#3B82F6] font-semibold">{study.modalitiesInStudy || study.modalities_in_study}</span></div>
              <div><span className="text-[#8B949E]">Accession #:</span> <span className="font-mono block truncate">{study.accessionNumber || study.accession_number || '-'}</span></div>
              
              <div className="sm:col-span-2"><span className="text-[#8B949E]">Study Description:</span> <span className="italic block truncate">{study.studyDescription || study.study_description || '(No Description)'}</span></div>
              <div><span className="text-[#8B949E]">Study Date:</span> <span className="font-mono block">{formattedDate}</span></div>
              <div><span className="text-[#8B949E]">Study Time:</span> <span className="font-mono block">{study.studyTime || study.study_time || '-'}</span></div>
            </div>
            <div className="mt-2 text-[10px] text-[#8B949E] border-t border-[#252B34]/60 pt-1.5 flex items-center gap-1.5">
              <span>UID:</span> <span className="font-mono select-all text-[#C9D1D9]/70">{study.studyInstanceUid || study.study_instance_uid}</span>
            </div>
          </div>

          {!shareLink ? (
            /* Configure Settings View */
            <div className="flex flex-col gap-4">
              {/* Permissions Section */}
              <div className="flex flex-col gap-2">
                <h3 className="text-[10px] font-bold text-[#8B949E] uppercase tracking-wider border-b border-[#353C48] pb-1 select-none">Configure Sharing Permissions</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <label className="flex items-center gap-2 px-2.5 py-1.5 bg-[#252B34] border border-[#353C48] rounded-[4px] text-[12px] text-[#C9D1D9] hover:bg-[#2C333E] hover:text-white cursor-pointer select-none">
                    <input type="checkbox" checked={viewImages} onChange={(e) => setViewImages(e.target.checked)} className="accent-[#3B82F6] cursor-pointer" />
                    View Images
                  </label>
                  <label className="flex items-center gap-2 px-2.5 py-1.5 bg-[#252B34] border border-[#353C48] rounded-[4px] text-[12px] text-[#C9D1D9] hover:bg-[#2C333E] hover:text-white cursor-pointer select-none">
                    <input type="checkbox" checked={windowLevel} onChange={(e) => setWindowLevel(e.target.checked)} className="accent-[#3B82F6] cursor-pointer" />
                    Window / Level
                  </label>
                  <label className="flex items-center gap-2 px-2.5 py-1.5 bg-[#252B34] border border-[#353C48] rounded-[4px] text-[12px] text-[#C9D1D9] hover:bg-[#2C333E] hover:text-white cursor-pointer select-none">
                    <input type="checkbox" checked={zoom} onChange={(e) => setZoom(e.target.checked)} className="accent-[#3B82F6] cursor-pointer" />
                    Zoom
                  </label>
                  <label className="flex items-center gap-2 px-2.5 py-1.5 bg-[#252B34] border border-[#353C48] rounded-[4px] text-[12px] text-[#C9D1D9] hover:bg-[#2C333E] hover:text-white cursor-pointer select-none">
                    <input type="checkbox" checked={pan} onChange={(e) => setPan(e.target.checked)} className="accent-[#3B82F6] cursor-pointer" />
                    Pan
                  </label>
                  <label className="flex items-center gap-2 px-2.5 py-1.5 bg-[#252B34] border border-[#353C48] rounded-[4px] text-[12px] text-[#C9D1D9] hover:bg-[#2C333E] hover:text-white cursor-pointer select-none">
                    <input type="checkbox" checked={scroll} onChange={(e) => setScroll(e.target.checked)} className="accent-[#3B82F6] cursor-pointer" />
                    Scroll
                  </label>
                  <label className="flex items-center gap-2 px-2.5 py-1.5 bg-[#252B34] border border-[#353C48] rounded-[4px] text-[12px] text-[#C9D1D9] hover:bg-[#2C333E] hover:text-white cursor-pointer select-none">
                    <input type="checkbox" checked={measurements} onChange={(e) => setMeasurements(e.target.checked)} className="accent-[#3B82F6] cursor-pointer" />
                    Measurements
                  </label>
                  <label className="flex items-center gap-2 px-2.5 py-1.5 bg-[#252B34] border border-[#353C48] rounded-[4px] text-[12px] text-[#C9D1D9] hover:bg-[#2C333E] hover:text-white cursor-pointer select-none">
                    <input type="checkbox" checked={viewAnnotations} onChange={(e) => setViewAnnotations(e.target.checked)} className="accent-[#3B82F6] cursor-pointer" />
                    View Annotations
                  </label>
                  
                  {/* Optional/Inactive extra permissions */}
                  <label className="flex items-center gap-2 px-2.5 py-1.5 bg-[#1F242C] border border-[#2D333E] rounded-[4px] text-[12px] text-[#8B949E] hover:text-white cursor-pointer select-none">
                    <input type="checkbox" checked={editAnnotations} onChange={(e) => setEditAnnotations(e.target.checked)} className="accent-[#3B82F6] cursor-pointer" />
                    Edit Annotations
                  </label>
                  <label className="flex items-center gap-2 px-2.5 py-1.5 bg-[#1F242C] border border-[#2D333E] rounded-[4px] text-[12px] text-[#8B949E] hover:text-white cursor-pointer select-none">
                    <input type="checkbox" checked={downloadPdf} onChange={(e) => setDownloadPdf(e.target.checked)} className="accent-[#3B82F6] cursor-pointer" />
                    Download PDF
                  </label>
                  <label className="flex items-center gap-2 px-2.5 py-1.5 bg-[#1F242C] border border-[#2D333E] rounded-[4px] text-[12px] text-[#8B949E] hover:text-white cursor-pointer select-none">
                    <input type="checkbox" checked={downloadDicom} onChange={(e) => setDownloadDicom(e.target.checked)} className="accent-[#3B82F6] cursor-pointer" />
                    Download DICOM
                  </label>
                </div>
              </div>

              {/* Expiration & Security Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Expiration Select */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-[#8B949E] uppercase tracking-wider flex items-center gap-1 select-none">
                    <Calendar className="w-3.5 h-3.5" />
                    Link Expiration
                  </label>
                  <select 
                    value={expiration} 
                    onChange={(e) => setExpiration(e.target.value)}
                    className="bg-[#252B34] border border-[#353C48] rounded-[4px] text-[12px] font-sans text-white p-2 outline-none focus:border-[#3B82F6] transition-subtle cursor-pointer"
                  >
                    <option value="24h">24 Hours (Recommended)</option>
                    <option value="7d">7 Days</option>
                    <option value="30d">30 Days</option>
                    <option value="never">Never (Permanent Link)</option>
                  </select>
                </div>

                {/* Password Protection */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between select-none">
                    <label className="text-[10px] font-bold text-[#8B949E] uppercase tracking-wider flex items-center gap-1">
                      <Key className="w-3.5 h-3.5" />
                      Password Protection
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-[#8B949E] cursor-pointer hover:text-white">
                      <input 
                        type="checkbox" 
                        checked={showPasswordInput} 
                        onChange={(e) => {
                          setShowPasswordInput(e.target.checked);
                          if (!e.target.checked) setPassword('');
                        }} 
                        className="accent-[#3B82F6]" 
                      />
                      Enable
                    </label>
                  </div>
                  <input
                    type="password"
                    placeholder="Enter security password..."
                    disabled={!showPasswordInput}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`bg-[#252B34] border rounded-[4px] text-[12px] font-sans text-white p-2 outline-none transition-subtle ${
                      showPasswordInput 
                        ? 'border-[#353C48] focus:border-[#3B82F6] placeholder-[#8B949E]' 
                        : 'border-transparent text-transparent bg-[#252B34]/30 pointer-events-none placeholder-transparent select-none'
                    }`}
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Result Link Display View */
            <div className="flex flex-col gap-4 animate-in fade-in duration-200">
              
              {/* Confirm Regenerate Dialog Banner */}
              {showConfirmRegenerate && (
                <div className="bg-[#3D1418] border border-[#6E1E24] p-3 rounded-[4px] flex gap-3 text-[12px] text-[#FCA5A5] items-start">
                  <ShieldAlert className="w-5 h-5 shrink-0 text-[#FCA5A5] mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold block mb-0.5">Are you sure you want to regenerate?</span>
                    <span className="text-[11px] text-[#FCA5A5]/80 block mb-2">Generating a new link will revoke and invalidate the current active share link immediately.</span>
                    <div className="flex gap-2">
                      <button onClick={handleRegenerate} className="px-2.5 py-1 bg-[#EF4444] text-white font-semibold rounded hover:bg-[#DC2626] transition-colors cursor-pointer outline-none">
                        Yes, Regenerate
                      </button>
                      <button onClick={() => setShowConfirmRegenerate(false)} className="px-2.5 py-1 bg-transparent border border-[#FCA5A5]/30 rounded text-[#FCA5A5] hover:bg-[#FCA5A5]/10 transition-colors cursor-pointer outline-none">
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Share URL text panel */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[#8B949E] uppercase tracking-wider select-none">Secure Share Link</label>
                <div className="flex gap-1.5 items-center">
                  <input
                    type="text"
                    readOnly
                    value={shareLink}
                    className="flex-1 bg-[#14171C] border border-[#252B34] rounded-[4px] p-2 text-[12px] font-mono select-all text-white outline-none focus:border-[#3B82F6]"
                  />
                  <button 
                    onClick={handleCopyLink} 
                    title="Copy Link to Clipboard (Ctrl+C)"
                    className="flex items-center justify-center p-2 rounded-[4px] bg-[#252B34] border border-[#353C48] hover:bg-[#2C333E] hover:text-white text-[#C9D1D9] transition-subtle cursor-pointer outline-none"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={handleOpenExternal}
                    title="Open Link in Web Browser"
                    className="flex items-center justify-center p-2 rounded-[4px] bg-[#252B34] border border-[#353C48] hover:bg-[#2C333E] hover:text-white text-[#C9D1D9] transition-subtle cursor-pointer outline-none"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Layout for details and QR code side-by-side */}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-4">
                {/* Details Table */}
                <div className="bg-[#14171C] border border-[#252B34] rounded-[4px] p-3 text-[12px] flex flex-col gap-2">
                  <h4 className="text-[10px] font-bold text-[#8B949E] uppercase tracking-wider border-b border-[#252B34] pb-1 select-none">Share Link Metadata</h4>
                  <div className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-1 text-[#C9D1D9]">
                    <span className="text-[#8B949E]">Status:</span>
                    <span className="flex items-center gap-1.5 font-semibold text-[#10B981]">
                      <span className="w-2 h-2 rounded-full bg-[#10B981] inline-block"></span>
                      Active
                    </span>
                    
                    <span className="text-[#8B949E]">Created:</span>
                    <span className="font-mono">{new Date(tokenInfo?.created_at || Date.now()).toLocaleString()}</span>
                    
                    <span className="text-[#8B949E]">Expires:</span>
                    <span className="font-mono text-[#F59E0B]">
                      {tokenInfo?.expires_at ? new Date(tokenInfo.expires_at).toLocaleString() : 'Never (Permanent)'}
                    </span>
                    
                    <span className="text-[#8B949E]">Protected:</span>
                    <span>{tokenInfo?.password_hash ? 'Yes (Password Secured)' : 'No'}</span>
                    
                    <span className="text-[#8B949E] self-start">Permissions:</span>
                    <div className="flex flex-wrap gap-1">
                      {tokenInfo?.permissions?.view && <span className="bg-[#1F242C] text-[#8B949E] px-1.5 py-0.5 rounded text-[10px] border border-[#2D333E]">Read</span>}
                      {tokenInfo?.permissions?.measure && <span className="bg-[#1F242C] text-[#8B949E] px-1.5 py-0.5 rounded text-[10px] border border-[#2D333E]">Measure</span>}
                      {tokenInfo?.permissions?.annotation && <span className="bg-[#1F242C] text-[#8B949E] px-1.5 py-0.5 rounded text-[10px] border border-[#2D333E]">Annotations</span>}
                      {tokenInfo?.permissions?.download && <span className="bg-[#1F242C] text-[#8B949E] px-1.5 py-0.5 rounded text-[10px] border border-[#2D333E]">Download</span>}
                    </div>
                  </div>
                </div>

                {/* QR Code Container */}
                <div className="flex flex-col items-center justify-center p-3 bg-white border border-[#353C48] rounded-[4px] shrink-0 h-[200px]">
                  {qrCodeDataUrl ? (
                    <div className="flex flex-col items-center gap-2">
                      <img src={qrCodeDataUrl} className="w-[120px] h-[120px] object-contain select-all" alt="Share QR Code" />
                      <div className="flex gap-1.5 text-[10px] select-none font-semibold text-[#1C1F26]">
                        <button onClick={handleCopyQRCode} className="hover:text-[#3B82F6] transition-colors cursor-pointer outline-none">Copy</button>
                        <span>•</span>
                        <button onClick={handleSaveQRCode} className="hover:text-[#3B82F6] transition-colors cursor-pointer outline-none">Save</button>
                        <span>•</span>
                        <button onClick={handlePrintQRCode} className="hover:text-[#3B82F6] transition-colors cursor-pointer outline-none">Print</button>
                      </div>
                    </div>
                  ) : (
                    <span className="text-[12px] text-[#8B949E] italic">Loading QR...</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#17191E] border-t border-[#353C48] select-none">
          <button
            onClick={onOpenManageShares}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#252B34] border border-[#353C48] rounded hover:bg-[#2A323D] text-[12px] font-sans text-white cursor-pointer transition-subtle outline-none focus:ring-1 focus:ring-[#3B82F6]"
          >
            <Link className="w-3.5 h-3.5 text-[#3B82F6]" />
            Manage Links
          </button>
          
          <div className="flex gap-2">
            {!shareLink ? (
              <button
                onClick={handleGenerateLink}
                disabled={loading}
                className="flex items-center justify-center gap-1.5 px-4 py-1.5 bg-[#3B82F6] hover:bg-[#2563EB] disabled:bg-[#3b82f6]/40 disabled:pointer-events-none rounded text-[12px] font-sans font-bold text-white cursor-pointer transition-subtle outline-none focus:ring-1 focus:ring-white"
              >
                {loading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    Generating...
                  </>
                ) : (
                  <>
                    <QrCode className="w-3.5 h-3.5" />
                    Generate Link
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={confirmRegenerateLink}
                disabled={loading || showConfirmRegenerate}
                className="flex items-center justify-center gap-1.5 px-4 py-1.5 bg-[#D97706] hover:bg-[#B45309] disabled:bg-[#D97706]/40 disabled:pointer-events-none rounded text-[12px] font-sans font-bold text-white cursor-pointer transition-subtle outline-none focus:ring-1 focus:ring-white"
              >
                Regenerate Link
              </button>
            )}
            
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 bg-transparent border border-[#353C48] hover:bg-[#252B34] rounded text-[12px] font-sans text-[#C9D1D9] hover:text-white cursor-pointer transition-subtle outline-none"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
