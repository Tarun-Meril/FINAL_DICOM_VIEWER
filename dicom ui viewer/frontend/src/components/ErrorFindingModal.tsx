import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, CheckCircle, RefreshCw, X, Server, Eye, Cpu, Database, 
  HelpCircle, Activity, Play, ShieldAlert, ArrowRight
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import { getRenderingEngine } from '@cornerstonejs/core';
import { useAppStore } from '../vr/state/store';

export interface DiagnosticResult {
  fastApi8000: { status: 'checking' | 'ok' | 'error'; message: string; latency?: number };
  pacs3001: { status: 'checking' | 'ok' | 'error'; message: string; latency?: number };
  webgl: { status: 'checking' | 'ok' | 'error'; message: string; details?: string };
  viewports: Array<{
    id: string;
    hasImageData: boolean;
    imageCount: number;
    parallelScale?: number;
    dimensions?: number[];
    status: 'ok' | 'waiting' | 'error';
    message: string;
  }>;
  vrVolume: {
    status: 'idle' | 'loading' | 'ready' | 'error';
    message: string;
    progress?: string;
  };
}

interface ErrorFindingModalProps {
  isOpen: boolean;
  onClose: () => void;
  study?: any;
  onActionCommand?: (cmd: string) => void;
}

export default function ErrorFindingModal({ isOpen, onClose, study, onActionCommand }: ErrorFindingModalProps) {
  const [isRunningScan, setIsRunningScan] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'endpoints' | 'viewports' | 'vr'>('overview');
  const vrStore = useAppStore();

  const [diagnostics, setDiagnostics] = useState<DiagnosticResult>({
    fastApi8000: { status: 'checking', message: 'Checking port 8000...' },
    pacs3001: { status: 'checking', message: 'Checking port 3001...' },
    webgl: { status: 'checking', message: 'Probing GPU & WebGL...' },
    viewports: [],
    vrVolume: { status: 'idle', message: 'VR status pending scan' }
  });

  const runDiagnostics = async () => {
    setIsRunningScan(true);

    // 1. Test FastAPI Port 8000
    let fastApiStatus: DiagnosticResult['fastApi8000'] = { status: 'checking', message: 'Testing port 8000...' };
    const t0 = performance.now();
    try {
      const res = await fetch('http://127.0.0.1:8000/api/health', { signal: AbortSignal.timeout(3500) });
      const latency = Math.round(performance.now() - t0);
      if (res.ok) {
        fastApiStatus = { status: 'ok', message: `FastAPI Online (${latency}ms latency)`, latency };
      } else {
        fastApiStatus = { status: 'error', message: `FastAPI returned HTTP ${res.status}: ${res.statusText}`, latency };
      }
    } catch (err: any) {
      // Try /api/studies
      try {
        const res2 = await fetch('http://127.0.0.1:8000/api/studies', { signal: AbortSignal.timeout(3500) });
        const latency = Math.round(performance.now() - t0);
        if (res2.ok) {
          fastApiStatus = { status: 'ok', message: `FastAPI Studies API Online (${latency}ms latency)`, latency };
        } else {
          fastApiStatus = { status: 'error', message: `Port 8000 returned HTTP ${res2.status}`, latency };
        }
      } catch (err2: any) {
        fastApiStatus = { status: 'error', message: `Cannot connect to Port 8000: ${err2.message || 'Connection Refused'}` };
      }
    }

    // 2. Test PACS Archive Port 3001
    let pacsStatus: DiagnosticResult['pacs3001'] = { status: 'checking', message: 'Testing port 3001...' };
    const t1 = performance.now();
    try {
      const res = await fetch('http://127.0.0.1:3001/api/health', { signal: AbortSignal.timeout(3500) });
      const latency = Math.round(performance.now() - t1);
      if (res.ok) {
        pacsStatus = { status: 'ok', message: `PACS Archive Online (${latency}ms latency)`, latency };
      } else {
        pacsStatus = { status: 'error', message: `Port 3001 returned HTTP ${res.status}`, latency };
      }
    } catch (err: any) {
      try {
        const res2 = await fetch('http://127.0.0.1:3001/api/studies', { signal: AbortSignal.timeout(3500) });
        const latency = Math.round(performance.now() - t1);
        if (res2.ok) {
          pacsStatus = { status: 'ok', message: `Port 3001 Studies API Online (${latency}ms)`, latency };
        } else {
          pacsStatus = { status: 'error', message: `Port 3001 returned HTTP ${res2.status}`, latency };
        }
      } catch (err2: any) {
        pacsStatus = { status: 'error', message: `Cannot connect to Port 3001: ${err2.message || 'Connection Refused'}` };
      }
    }

    // 3. Test WebGL & GPU
    let webglStatus: DiagnosticResult['webgl'] = { status: 'checking', message: 'Checking WebGL 2.0...' };
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Standard WebGL2';
        const maxTexture = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE || gl.MAX_TEXTURE_SIZE);
        webglStatus = {
          status: 'ok',
          message: 'WebGL 2.0 Hardware Acceleration Active',
          details: `${renderer} (Max 3D Texture: ${maxTexture}px)`
        };
      } else {
        webglStatus = {
          status: 'error',
          message: 'WebGL 2.0 context unavailable',
          details: 'Check GPU drivers or enable hardware acceleration in browser/Electron settings.'
        };
      }
    } catch (e: any) {
      webglStatus = { status: 'error', message: 'WebGL Error', details: e.message };
    }

    // 4. Test Viewport Image States
    const viewports: DiagnosticResult['viewports'] = [];
    try {
      const re = getRenderingEngine('medview-rendering-engine');
      if (re) {
        for (let i = 1; i <= 4; i++) {
          const vpId = `viewport-${i}`;
          const vp = re.getViewport(vpId) as any;
          if (!vp) {
            viewports.push({
              id: vpId,
              hasImageData: false,
              imageCount: 0,
              status: 'waiting',
              message: 'Viewport unmounted or not enabled'
            });
            continue;
          }

          const imgData = vp.getImageData ? vp.getImageData() : null;
          const imageIds = vp.getImageIds ? vp.getImageIds() : [];
          const cam = vp.getCamera ? vp.getCamera() : null;
          const hasImg = !!imgData && !!imgData.dimensions && imgData.dimensions[0] > 0;

          if (hasImg) {
            viewports.push({
              id: vpId,
              hasImageData: true,
              imageCount: imageIds.length,
              parallelScale: cam?.parallelScale,
              dimensions: imgData.dimensions,
              status: 'ok',
              message: `Image Loaded (${imgData.dimensions[0]}×${imgData.dimensions[1]}, scale: ${Math.round(cam?.parallelScale || 0)})`
            });
          } else if (imageIds.length > 0) {
            viewports.push({
              id: vpId,
              hasImageData: false,
              imageCount: imageIds.length,
              parallelScale: cam?.parallelScale,
              status: 'waiting',
              message: `Stack has ${imageIds.length} images; decoding slice in Web Worker…`
            });
          } else {
            viewports.push({
              id: vpId,
              hasImageData: false,
              imageCount: 0,
              status: 'error',
              message: 'No DICOM series instances bound to viewport.'
            });
          }
        }
      } else {
        viewports.push({
          id: 'engine',
          hasImageData: false,
          imageCount: 0,
          status: 'error',
          message: 'Cornerstone3D RenderingEngine not initialized yet.'
        });
      }
    } catch (e: any) {
      // ignore
    }

    // 5. Test VR Volume
    const vrStatus: DiagnosticResult['vrVolume'] = {
      status: vrStore.status,
      message: vrStore.error ? (vrStore.error.message || vrStore.error.detail || 'VR load error') : 
               vrStore.status === 'ready' ? '3D Volume Loaded & Rendered' :
               vrStore.status === 'loading' ? (vrStore.progress?.message || 'Volume fetching...') :
               'VR ready to fetch on activation'
    };

    setDiagnostics({
      fastApi8000: fastApiStatus,
      pacs3001: pacsStatus,
      webgl: webglStatus,
      viewports,
      vrVolume: vrStatus
    });

    setIsRunningScan(false);
  };

  useEffect(() => {
    if (isOpen) {
      runDiagnostics();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Determine overall status
  const hasErrors = diagnostics.fastApi8000.status === 'error' && diagnostics.pacs3001.status === 'error';
  const viewportIssues = diagnostics.viewports.some(v => v.status === 'error');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-[#14171D] border border-[#2D333F] rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#232731] flex items-center justify-between bg-[#101217]">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${hasErrors ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-base flex items-center gap-2">
                MerilView System Diagnostics &amp; Error Finding
              </h2>
              <p className="text-xs text-gray-400">
                Live inspection of PACS connectivity, 2D viewports, and 3D Volume Rendering pipeline
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-[#232731] bg-[#12141A] px-5 gap-4 text-xs font-medium">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2.5 border-b-2 transition ${activeTab === 'overview' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
          >
            Diagnostic Findings
          </button>
          <button
            onClick={() => setActiveTab('endpoints')}
            className={`py-2.5 border-b-2 transition ${activeTab === 'endpoints' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
          >
            PACS Backend Servers
          </button>
          <button
            onClick={() => setActiveTab('viewports')}
            className={`py-2.5 border-b-2 transition ${activeTab === 'viewports' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
          >
            2D Viewports ({diagnostics.viewports.filter(v => v.hasImageData).length}/{diagnostics.viewports.length} Loaded)
          </button>
          <button
            onClick={() => setActiveTab('vr')}
            className={`py-2.5 border-b-2 transition ${activeTab === 'vr' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
          >
            3D VR Volume Status
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-sm text-gray-200">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Summary Banner */}
              <div className={`p-4 rounded-lg border flex items-start gap-3.5 ${
                hasErrors
                  ? 'bg-red-950/30 border-red-800 text-red-200'
                  : viewportIssues
                  ? 'bg-amber-950/30 border-amber-800 text-amber-200'
                  : 'bg-emerald-950/30 border-emerald-800 text-emerald-200'
              }`}>
                {hasErrors ? (
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className="font-semibold text-sm">
                    {hasErrors
                      ? 'PACS Backend Server Unreachable'
                      : viewportIssues
                      ? 'Viewport Image Ingestion Notice'
                      : 'Clinical Pipeline Healthy'}
                  </h4>
                  <p className="text-xs text-gray-300 mt-1">
                    {hasErrors
                      ? 'Neither Port 8000 nor Port 3001 responded to health probes. Make sure the backend services are started.'
                      : viewportIssues
                      ? 'Some viewports are awaiting DICOM slices or decoding. If images appear black, use the "Force Re-center & Re-render" action below.'
                      : 'All endpoints and hardware acceleration contexts are operational.'}
                  </p>
                </div>
              </div>

              {/* Quick Status Cards Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-lg bg-[#181B22] border border-[#2B313E] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Server className="w-4 h-4 text-blue-400" />
                    <div>
                      <div className="text-xs font-medium text-white">FastAPI (Port 8000)</div>
                      <div className="text-[11px] text-gray-400">{diagnostics.fastApi8000.message}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    diagnostics.fastApi8000.status === 'ok' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'
                  }`}>
                    {diagnostics.fastApi8000.status}
                  </span>
                </div>

                <div className="p-3.5 rounded-lg bg-[#181B22] border border-[#2B313E] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Database className="w-4 h-4 text-purple-400" />
                    <div>
                      <div className="text-xs font-medium text-white">PACS Archive (Port 3001)</div>
                      <div className="text-[11px] text-gray-400">{diagnostics.pacs3001.message}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    diagnostics.pacs3001.status === 'ok' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'
                  }`}>
                    {diagnostics.pacs3001.status}
                  </span>
                </div>

                <div className="p-3.5 rounded-lg bg-[#181B22] border border-[#2B313E] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Eye className="w-4 h-4 text-cyan-400" />
                    <div>
                      <div className="text-xs font-medium text-white">2D Viewports</div>
                      <div className="text-[11px] text-gray-400">
                        {diagnostics.viewports.filter(v => v.hasImageData).length} of {diagnostics.viewports.length} showing pixel data
                      </div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    diagnostics.viewports.some(v => v.hasImageData) ? 'bg-emerald-900/60 text-emerald-300' : 'bg-amber-900/60 text-amber-300'
                  }`}>
                    {diagnostics.viewports.some(v => v.hasImageData) ? 'Active' : 'Pending'}
                  </span>
                </div>

                <div className="p-3.5 rounded-lg bg-[#181B22] border border-[#2B313E] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Cpu className="w-4 h-4 text-amber-400" />
                    <div>
                      <div className="text-xs font-medium text-white">GPU &amp; WebGL 2.0</div>
                      <div className="text-[11px] text-gray-400 truncate max-w-[180px]">{diagnostics.webgl.details || diagnostics.webgl.message}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    diagnostics.webgl.status === 'ok' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'
                  }`}>
                    {diagnostics.webgl.status}
                  </span>
                </div>
              </div>

              {/* Error Explanation Accordion / Help */}
              <div className="bg-[#12141B] border border-[#232731] rounded-lg p-3.5 text-xs space-y-2">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
                  Why might images or 3D VR not load?
                </div>
                <ul className="list-disc pl-5 text-gray-300 space-y-1">
                  <li>
                    <strong className="text-white">Cornerstone Camera Bounds:</strong> When multi-slice CT stacks load, camera scale must adjust to image dimensions. Clicking "Force Re-center" immediately recalculates bounds.
                  </li>
                  <li>
                    <strong className="text-white">JPEG 2000 Worker Decoding:</strong> High-resolution CT slices decode via background WebAssembly workers. On high slice counts (250+), this takes a few seconds on initial load.
                  </li>
                  <li>
                    <strong className="text-white">VR PACS Stream:</strong> Volume rendering fetches all slices in parallel with 16 connections. If one endpoint is busy, it automatically tries fallback port 3001.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'endpoints' && (
            <div className="space-y-3">
              <div className="p-3 bg-[#181B22] rounded-lg border border-[#2B313E] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">FastAPI Backend (Port 8000)</span>
                  <span className="text-xs font-mono text-blue-400">http://127.0.0.1:8000</span>
                </div>
                <p className="text-xs text-gray-300">{diagnostics.fastApi8000.message}</p>
              </div>

              <div className="p-3 bg-[#181B22] rounded-lg border border-[#2B313E] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">Node.js PACS Archive Service (Port 3001)</span>
                  <span className="text-xs font-mono text-purple-400">http://127.0.0.1:3001</span>
                </div>
                <p className="text-xs text-gray-300">{diagnostics.pacs3001.message}</p>
              </div>
            </div>
          )}

          {activeTab === 'viewports' && (
            <div className="space-y-2">
              {diagnostics.viewports.map((vp) => (
                <div key={vp.id} className="p-3 bg-[#181B22] rounded-lg border border-[#2B313E] flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-white capitalize">{vp.id}</div>
                    <div className="text-xs text-gray-300">{vp.message}</div>
                    {vp.dimensions && (
                      <div className="text-[11px] font-mono text-gray-400 mt-0.5">
                        Dimensions: {vp.dimensions.join('×')} | Scale: {Math.round(vp.parallelScale || 0)}
                      </div>
                    )}
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    vp.hasImageData ? 'bg-emerald-900/60 text-emerald-300' : 'bg-amber-900/60 text-amber-300'
                  }`}>
                    {vp.hasImageData ? 'Rendered' : 'Waiting'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'vr' && (
            <div className="space-y-3">
              <div className="p-4 bg-[#181B22] rounded-lg border border-[#2B313E] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">3D Volume Rendering Engine Status</span>
                  <span className="text-xs font-bold uppercase text-blue-400">{diagnostics.vrVolume.status}</span>
                </div>
                <p className="text-xs text-gray-300">{diagnostics.vrVolume.message}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-[#232731] bg-[#101217] flex items-center justify-between">
          <button
            onClick={runDiagnostics}
            disabled={isRunningScan}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#232834] hover:bg-[#2F3646] active:bg-[#1E222C] text-xs font-medium text-gray-200 rounded transition border border-[#353D4E]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunningScan ? 'animate-spin' : ''}`} />
            <span>Re-run Diagnostic Scan</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onActionCommand?.('reset');
                onClose();
              }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-medium rounded transition shadow"
            >
              Force Re-center &amp; Re-render
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-[#1B1E26] hover:bg-[#252A35] text-gray-300 text-xs font-medium rounded transition border border-[#2D3341]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
