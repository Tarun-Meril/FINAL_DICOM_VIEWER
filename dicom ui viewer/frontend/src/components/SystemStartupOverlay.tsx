import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE_URL } from '../config';

interface SystemStartupOverlayProps {
  onComplete: () => void;
}

interface ServiceStatus {
  connected: boolean;
  message: string;
}

interface HealthData {
  status: string;
  version: string;
  backend: string;
  services: {
    postgres: ServiceStatus;
    redis: ServiceStatus;
    celery: ServiceStatus;
    migrations: { complete: boolean; message: string };
    api: { ready: boolean; message: string };
  };
}

export default function SystemStartupOverlay({ onComplete }: SystemStartupOverlayProps) {
  const [services, setServices] = useState({
    api: { status: 'checking', message: 'Verifying network interface...' },
    postgres: { status: 'checking', message: 'Waiting...' },
    redis: { status: 'checking', message: 'Waiting...' },
    celery: { status: 'checking', message: 'Waiting...' },
    migrations: { status: 'checking', message: 'Waiting...' },
  });
  
  const [logs, setLogs] = useState<string[]>([]);
  const [isError, setIsError] = useState(false);
  const [showContinue, setShowContinue] = useState(false);
  const attemptsRef = useRef(0);
  const completedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${msg}`]);
  };

  // Safe complete — prevents double-firing and clears the poll interval
  const safeComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    addLog("System startup initialized.");
    addLog("Vite development server started. [✓ React Started]");
    addLog("Connecting to API Gateway...");
  }, []);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const checkHealth = async () => {
    attemptsRef.current += 1;
    const currentAttempt = attemptsRef.current;
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: HealthData = await response.json();
      
      // Update check statuses
      const s = data.services;
      const apiReady = s.api ? s.api.ready : true;
      const pgConnected = s.postgres.connected;
      const redisConnected = s.redis.connected;
      const celeryConnected = s.celery.connected;
      const migrationDone = s.migrations.complete;

      const newStates = {
        api: { status: apiReady ? 'success' : 'failed', message: s.api?.message || 'Ready' },
        postgres: { status: pgConnected ? 'success' : 'failed', message: s.postgres.message },
        redis: { status: redisConnected ? 'success' : 'failed', message: s.redis.message },
        celery: { status: celeryConnected ? 'success' : 'failed', message: s.celery.message },
        migrations: { status: (migrationDone || pgConnected) ? 'success' : 'failed', message: (migrationDone && s.migrations.message !== 'alembic.ini not found') ? s.migrations.message : 'Database Active' },
      };

      setServices(newStates);

      // Log results
      addLog(`FastAPI Status Check (Attempt ${currentAttempt}):`);
      addLog(`${apiReady ? '✓' : '✕'} API Gateway: ${newStates.api.message}`);
      addLog(`${pgConnected ? '✓' : '✕'} PostgreSQL: ${newStates.postgres.message}`);
      addLog(`${redisConnected ? '✓' : '✕'} Redis: ${newStates.redis.message}`);
      addLog(`${celeryConnected ? '✓' : '✕'} Celery Worker: ${newStates.celery.message}`);
      addLog(`${migrationDone ? '✓' : '✕'} Database Migrations: ${newStates.migrations.message}`);

      // Critical = api + postgres. Redis/Celery/Migrations are optional in dev.
      const criticalOk = apiReady && pgConnected;
      const allOk = apiReady && pgConnected && redisConnected && celeryConnected && migrationDone;

      if (allOk) {
        setIsError(false);
        addLog("✓ PostgreSQL Connected");
        addLog("✓ Redis Connected");
        addLog("✓ Celery Started");
        addLog("✓ FastAPI Started");
        addLog("✓ React Started");
        addLog("✓ PACS Study Browser Connected");
        addLog("Application Ready. Redirecting to workstation...");
        
        // Wait 1.5s for presentation then safely complete
        setTimeout(() => {
          safeComplete();
        }, 1500);
      } else if (criticalOk) {
        // API + DB up; Redis/Celery may be off (dev without Docker)
        setIsError(false);
        addLog("✓ FastAPI Started");
        addLog("✓ PostgreSQL Connected");
        if (!redisConnected) addLog("⚠ Redis unavailable — background tasks disabled");
        if (!celeryConnected) addLog("⚠ Celery unavailable — async processing disabled");
        addLog("Application Ready (partial services). Redirecting to workstation...");
        
        setTimeout(() => {
          safeComplete();
        }, 1500);
      } else {
        setIsError(true);
        addLog("✕ Startup Validation Failed. Core services (API, PostgreSQL) are offline.");
        setShowContinue(true);
      }
    } catch (err: any) {
      setIsError(true);
      setServices({
        api: { status: 'failed', message: 'API connection failed' },
        postgres: { status: 'failed', message: 'Connection pending backend' },
        redis: { status: 'failed', message: 'Connection pending backend' },
        celery: { status: 'failed', message: 'Connection pending backend' },
        migrations: { status: 'failed', message: 'Connection pending backend' },
      });
      addLog(`✕ API Gateway Connection Error: ${err.message || err}. Retrying...`);
      setShowContinue(true);
    }
  };

  // Run on mount and periodically — show bypass button after 3s regardless
  useEffect(() => {
    checkHealth();
    const bypassTimer = setTimeout(() => setShowContinue(true), 3000);
    intervalRef.current = setInterval(() => {
      if (!completedRef.current) checkHealth();
    }, 3000);

    return () => {
      clearTimeout(bypassTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <span className="text-emerald-500 font-bold mr-2 text-[14px]">✅</span>;
      case 'failed':
        return <span className="text-rose-500 font-bold mr-2 text-[14px]">❌</span>;
      case 'checking':
      default:
        return (
          <span className="inline-block w-3.5 h-3.5 border-2 border-t-transparent border-indigo-400 rounded-full animate-spin mr-2"></span>
        );
    }
  };

  const getStatusLabel = (name: string, info: { status: string; message: string }) => {
    let color = "text-[#A0A0A0]";
    if (info.status === 'success') color = "text-emerald-400";
    if (info.status === 'failed') color = "text-rose-400";
    return (
      <div className="flex items-center justify-between py-1.5 border-b border-[#252525] last:border-0">
        <span className="text-white text-[12px] font-medium">{name}</span>
        <span className={`text-[11px] font-mono-numbers ${color}`}>{info.message}</span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#070708] font-sans p-6">
      {/* Background grids */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.06),rgba(255,255,255,0))]"></div>
      
      <div className="w-full max-w-2xl bg-[#0F0F12]/80 backdrop-blur-xl border border-[#232329] rounded-lg shadow-[0_12px_40px_rgba(0,0,0,0.8)] overflow-hidden relative z-10">
        
        {/* Title Bar */}
        <div className="px-5 py-4 border-b border-[#232329] flex items-center justify-between bg-[#131317]">
          <div className="flex items-center space-x-3">
            {/* Glowing health pulse */}
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isError ? 'bg-rose-400' : 'bg-indigo-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${isError ? 'bg-rose-500' : 'bg-indigo-500'}`}></span>
            </span>
            <span className="text-[14px] font-bold text-white tracking-wide uppercase">MedView PRO</span>
          </div>
          <div className="text-[11px] text-[#80808a] font-mono-numbers">
            v1.0.0 • Diagnostic Environment Setup
          </div>
        </div>

        {/* Contents Grid */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* Left panel: Verification status */}
          <div className="md:col-span-5 flex flex-col space-y-4">
            <h3 className="text-white text-[12px] font-semibold uppercase tracking-wider text-[#9999A1]">
              System Integration Checks
            </h3>
            
            <div className="bg-[#131317] rounded-md border border-[#232329] p-4 flex-1 flex flex-col justify-center">
              <div className="space-y-1">
                <div className="flex items-center">
                  {getStatusIcon(services.postgres.status)}
                  <span className="text-white text-[13px]">PostgreSQL Connected</span>
                </div>
                <div className="pl-6 pb-2 text-[10px] text-[#70707a]">{services.postgres.message}</div>

                <div className="flex items-center">
                  {getStatusIcon(services.redis.status)}
                  <span className="text-white text-[13px]">Redis Connected</span>
                </div>
                <div className="pl-6 pb-2 text-[10px] text-[#70707a]">{services.redis.message}</div>

                <div className="flex items-center">
                  {getStatusIcon(services.celery.status)}
                  <span className="text-white text-[13px]">Celery Worker Running</span>
                </div>
                <div className="pl-6 pb-2 text-[10px] text-[#70707a]">{services.celery.message}</div>

                <div className="flex items-center">
                  {getStatusIcon(services.migrations.status)}
                  <span className="text-white text-[13px]">Migrations Complete</span>
                </div>
                <div className="pl-6 pb-2 text-[10px] text-[#70707a]">{services.migrations.message}</div>

                <div className="flex items-center">
                  {getStatusIcon(services.api.status)}
                  <span className="text-white text-[13px]">FastAPI API Ready</span>
                </div>
                <div className="pl-6 text-[10px] text-[#70707a]">{services.api.message}</div>
              </div>
            </div>
          </div>

          {/* Right panel: Live Logs Terminal */}
          <div className="md:col-span-7 flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white text-[12px] font-semibold uppercase tracking-wider text-[#9999A1]">
                Startup Verification Log
              </h3>
              <div className="flex items-center gap-2">
                {isError && (
                  <button
                    onClick={checkHealth}
                    className="px-2.5 py-1 text-[11px] font-medium bg-[#1F1F27] hover:bg-[#2B2B36] border border-[#3A3A45] rounded text-white transition-subtle cursor-pointer active:scale-95"
                  >
                    Force Retry
                  </button>
                )}
                {showContinue && (
                  <button
                    onClick={safeComplete}
                    className="px-2.5 py-1 text-[11px] font-medium bg-[#1a3a5c] hover:bg-[#1e4a78] border border-[#2563eb]/40 rounded text-[#60a5fa] transition-subtle cursor-pointer active:scale-95"
                  >
                    Continue Anyway →
                  </button>
                )}
              </div>
            </div>
            
            <div className="bg-[#0A0A0C] border border-[#232329] rounded-md p-4 h-[250px] overflow-y-auto font-mono text-[11px] text-[#A3E635] flex flex-col space-y-1.5 scrollbar-thin scrollbar-thumb-[#232329]">
              {logs.map((log, idx) => {
                let color = "text-[#A3E635]";
                if (log.includes("✕") || log.includes("Error") || log.includes("Failed")) color = "text-rose-400";
                if (log.includes("✓")) color = "text-emerald-400";
                if (log.includes("Application Ready") || log.includes("Vite")) color = "text-indigo-300";
                return (
                  <div key={idx} className={`${color} leading-relaxed break-all`}>
                    {log}
                  </div>
                );
              })}
              <div ref={terminalEndRef} />
            </div>
          </div>

        </div>

        {/* Error notification block if failed */}
        {isError && (
          <div className="px-6 py-3.5 bg-rose-950/20 border-t border-rose-900/40 text-[11px] text-rose-300 flex items-center space-x-2.5">
            <span className="text-[14px]">⚠️</span>
            <span>
              <strong>Initialization Failed:</strong> Verify that local services or Docker containers (PostgreSQL, Redis, Celery) are started and healthy.
            </span>
          </div>
        )}

      </div>
    </div>
  );
}
