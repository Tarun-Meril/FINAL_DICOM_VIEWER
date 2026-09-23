import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Search, Copy, ExternalLink, RefreshCw, Trash2, CalendarRange, 
  Ban, ChevronLeft, ChevronRight, Filter, ShieldAlert, Key, QrCode, 
  Download, ListOrdered, CheckSquare, Square, Save, FileSpreadsheet, 
  Info, Clock, Lock, Unlock, Printer, ChevronUp, ChevronDown
} from 'lucide-react';
import QRCode from 'qrcode';

const SHARE_API_BASE_URL = import.meta.env.VITE_SHARE_API_BASE_URL || 'http://localhost:3001';

interface ManageSharesDialogProps {
  onClose: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export default function ManageSharesDialog({ onClose, showToast }: ManageSharesDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedLink, setSelectedLink] = useState<any | null>(null);

  // Search & Filter Configuration
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // 'all', 'active', 'expired', 'revoked'
  const [permissionFilter, setPermissionFilter] = useState<string>('all'); // 'all', 'view', 'measure', 'annotation', 'download'
  const [dateFilter, setDateFilter] = useState<string>('all'); // 'all', 'today', 'week', 'month'

  // Sorting State
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 7;

  // Sidebar Sub-States
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPasswordForm, setShowPasswordForm] = useState<boolean>(false);
  const [extensionDays, setExtensionDays] = useState<string>('7'); // '1', '7', '30', '90', 'never', 'custom'
  const [customExpiryDate, setCustomExpiryDate] = useState<string>('');
  
  // Audit logs array for selected link
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);

  // Column resizing & reordering
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    patient_name: 110,
    patient_id: 85,
    study_description: 120,
    study_uid: 100,
    token: 80,
    created_at: 80,
    expires_at: 80,
    last_accessed: 80,
    status: 75,
    permissions: 90,
    password_protected: 65
  });

  const [colOrder, setColOrder] = useState<string[]>([
    'patient_name', 'patient_id', 'study_description', 'study_uid', 'token', 
    'created_at', 'expires_at', 'last_accessed', 'status', 'permissions', 'password_protected'
  ]);

  const columnHeaders: Record<string, string> = {
    patient_name: 'Patient Name',
    patient_id: 'Patient ID',
    study_description: 'Study Description',
    study_uid: 'Study UID',
    token: 'Token',
    created_at: 'Created Date',
    expires_at: 'Expiration Date',
    last_accessed: 'Last Opened',
    status: 'Status',
    permissions: 'Permissions',
    password_protected: 'Password'
  };

  // Fetch all share links
  const fetchLinks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SHARE_API_BASE_URL}/api/share/list`, {
        headers: { 'Bypass-Tunnel-Reminder': 'true' }
      });
      if (!res.ok) throw new Error('Failed to retrieve share list');
      const data = await res.json();
      setLinks(data);

      // Keep previously selected row loaded if still valid
      if (selectedLink) {
        const updatedSelected = data.find((l: any) => l.token === selectedLink.token);
        if (updatedSelected) {
          setSelectedLink(updatedSelected);
        } else {
          setSelectedLink(null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch share links:', err);
      showToast('API Error', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Fetch audit logs for selected link
  const fetchAuditLogs = async (token: string) => {
    setLoadingAudit(true);
    try {
      const res = await fetch(`${SHARE_API_BASE_URL}/api/share/${token}/audit`, {
        headers: { 'Bypass-Tunnel-Reminder': 'true' }
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      } else {
        setAuditLogs([]);
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
      setAuditLogs([]);
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, []);

  useEffect(() => {
    if (selectedLink?.token) {
      fetchAuditLogs(selectedLink.token);
    } else {
      setAuditLogs([]);
    }
  }, [selectedLink?.token]);

  // Handle mounting keyboard focus
  useEffect(() => {
    if (dialogRef.current) {
      dialogRef.current.focus();
    }
  }, []);

  // Escape key close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Generate QR Code canvas
  useEffect(() => {
    if (qrCanvasRef.current && selectedLink) {
      const shareUrl = getShareUrl(selectedLink.token);
      QRCode.toCanvas(qrCanvasRef.current, shareUrl, {
        width: 130,
        margin: 1,
        color: {
          dark: '#1C1F26',
          light: '#FFFFFF'
        }
      }).catch(err => console.error(err));
    }
  }, [selectedLink?.token]);

  // Helper status resolution
  const getExpirationStatus = (link: any): { label: string; bgClass: string; textClass: string; level: 'active' | 'expiring' | 'expired' | 'revoked' } => {
    if (link.revoked) {
      return { label: 'Revoked', bgClass: 'bg-[#2D3139]', textClass: 'text-[#8B949E]', level: 'revoked' };
    }
    if (link.expires_at) {
      const expiry = new Date(link.expires_at).getTime();
      const now = Date.now();
      if (expiry <= now) {
        return { label: 'Expired', bgClass: 'bg-[#3D1418]', textClass: 'text-[#EF4444]', level: 'expired' };
      }
      const dayInMs = 24 * 60 * 60 * 1000;
      if (expiry - now < dayInMs) {
        return { label: 'Expiring Soon', bgClass: 'bg-[#3C2518]', textClass: 'text-[#FFA000]', level: 'expiring' };
      }
    }
    return { label: 'Active', bgClass: 'bg-[#133D2D]', textClass: 'text-[#10B981]', level: 'active' };
  };

  const getShareUrl = (token: string) => {
    let hostUrl = import.meta.env.VITE_SHARE_BASE_URL;
    if (!hostUrl) {
      if (window.location.origin && window.location.origin !== 'file://' && !window.location.origin.startsWith('chrome-extension')) {
        hostUrl = window.location.origin;
      } else {
        hostUrl = SHARE_API_BASE_URL.replace('3001', '3000');
      }
    }
    return `${hostUrl}/share/${token}`;
  };

  // Actions
  const handleCopyLink = async (token: string) => {
    const generatedUrl = getShareUrl(token);
    try {
      if (window.electronAPI?.copyText) {
        await window.electronAPI.copyText(generatedUrl);
      } else {
        await navigator.clipboard.writeText(generatedUrl);
      }
      showToast('Link Copied');
    } catch (err) {
      showToast('Clipboard Failure', 'error');
    }
  };

  const handleOpenLink = (token: string) => {
    const generatedUrl = getShareUrl(token);
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(generatedUrl);
    } else {
      window.open(generatedUrl, '_blank');
    }
  };

  const handleRevoke = async (token: string) => {
    try {
      const res = await fetch(`${SHARE_API_BASE_URL}/api/share/${token}`, {
        method: 'DELETE',
        headers: { 'Bypass-Tunnel-Reminder': 'true' }
      });
      if (!res.ok) throw new Error('Revocation request failed');
      showToast('Link Revoked');
      fetchLinks();
    } catch (err) {
      showToast('API Error', 'error');
    }
  };

  const handleDelete = async (token: string) => {
    if (!window.confirm('Delete this share link permanently? This cannot be undone.')) {
      return;
    }
    try {
      const res = await fetch(`${SHARE_API_BASE_URL}/api/share/${token}?hard=true`, {
        method: 'DELETE',
        headers: { 'Bypass-Tunnel-Reminder': 'true' }
      });
      if (!res.ok) throw new Error('Deletion failed');
      showToast('Link Deleted');
      fetchLinks();
    } catch (err) {
      showToast('API Error', 'error');
    }
  };

  const handleTogglePermission = async (key: string, val: boolean) => {
    if (!selectedLink) return;
    const newPerms = { ...selectedLink.permissions, [key]: val };
    try {
      const res = await fetch(`${SHARE_API_BASE_URL}/api/share/${selectedLink.token}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: JSON.stringify({ permissions: newPerms })
      });
      if (!res.ok) throw new Error('Failed to update permissions');
      showToast('Permissions Updated', 'success');
      setLinks(prev => prev.map(l => l.token === selectedLink.token ? { ...l, permissions: newPerms } : l));
      setSelectedLink(prev => prev ? { ...prev, permissions: newPerms } : null);
    } catch (err) {
      showToast('API Error', 'error');
    }
  };

  const handleUpdatePassword = async (pass: string | null) => {
    if (!selectedLink) return;
    try {
      const res = await fetch(`${SHARE_API_BASE_URL}/api/share/${selectedLink.token}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: JSON.stringify({ password: pass })
      });
      if (!res.ok) throw new Error('Failed to update password');
      showToast(pass === null ? 'Password Removed' : 'Password Changed', 'success');
      setLinks(prev => prev.map(l => l.token === selectedLink.token ? { ...l, password_protected: pass !== null } : l));
      setSelectedLink(prev => prev ? { ...prev, password_protected: pass !== null } : null);
      setPasswordInput('');
      setShowPasswordForm(false);
    } catch (err) {
      showToast('API Error', 'error');
    }
  };

  const handleExtendExpiry = async () => {
    if (!selectedLink) return;
    let newExpiry: string | null = null;
    const baseDate = selectedLink.expires_at ? new Date(selectedLink.expires_at) : new Date();
    const startingTime = baseDate.getTime() <= Date.now() ? Date.now() : baseDate.getTime();

    if (extensionDays === 'never') {
      newExpiry = null;
    } else if (extensionDays === 'custom') {
      if (!customExpiryDate) {
        showToast('Please pick a custom date', 'warning');
        return;
      }
      newExpiry = new Date(customExpiryDate).toISOString();
    } else {
      const days = parseInt(extensionDays);
      newExpiry = new Date(startingTime + days * 24 * 3600 * 1000).toISOString();
    }

    try {
      const res = await fetch(`${SHARE_API_BASE_URL}/api/share/${selectedLink.token}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: JSON.stringify({ expires_at: newExpiry })
      });
      if (!res.ok) throw new Error('Failed to extend link expiration');
      showToast('Expiration Updated', 'success');
      setLinks(prev => prev.map(l => l.token === selectedLink.token ? { ...l, expires_at: newExpiry } : l));
      setSelectedLink(prev => prev ? { ...prev, expires_at: newExpiry } : null);
    } catch (err) {
      showToast('API Error', 'error');
    }
  };

  // QR operations
  const handleSaveQR = () => {
    if (!qrCanvasRef.current || !selectedLink) return;
    const url = qrCanvasRef.current.toDataURL('image/png');
    if (window.electronAPI?.saveImage) {
      window.electronAPI.saveImage(url, `qr_share_${selectedLink.token}.png`);
    } else {
      const link = document.createElement('a');
      link.download = `qr_share_${selectedLink.token}.png`;
      link.href = url;
      link.click();
    }
    showToast('QR Generated', 'success');
  };

  const handlePrintQR = () => {
    if (!qrCanvasRef.current) return;
    const url = qrCanvasRef.current.toDataURL('image/png');
    const win = window.open();
    if (win) {
      win.document.write(`<div style="display:flex;justify-content:center;align-items:center;height:100vh;"><img src="${url}" style="width:250px;" onload="window.print();window.close()"/></div>`);
      win.document.close();
    }
  };

  // Export CSVs
  const handleExportLinksCSV = () => {
    const headers = 'Patient Name,Patient ID,Study Description,Study UID,Share Token,Created Date,Expiration Date,Last Opened,Status,Permissions,Password Protected\n';
    const rows = filteredLinks.map(l => {
      const status = getExpirationStatus(l).label;
      const permStr = Object.entries(l.permissions || {})
        .filter(([_, v]) => v)
        .map(([k]) => k)
        .join('|');
      return `"${l.patient_name}","${l.patient_id}","${l.study_description}","${l.study_uid}","${l.token}","${l.created_at}","${l.expires_at || 'Never'}","${l.last_accessed || 'Never'}","${status}","${permStr}","${l.password_protected}"`;
    });
    const blob = new Blob([headers + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `medview_share_links_${Date.now()}.csv`;
    link.href = url;
    link.click();
    showToast('Export Successful', 'success');
  };

  const handleExportAuditCSV = () => {
    if (!selectedLink) return;
    const headers = 'Action,Timestamp,IP Address,Device,Browser\n';
    const rows = auditLogs.map(a => {
      return `"${a.action}","${a.created_at}","${a.ip_address || '127.0.0.1'}","${a.device || 'Desktop'}","${a.browser || 'Unknown'}"`;
    });
    const blob = new Blob([headers + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `share_audit_logs_${selectedLink.token}_${Date.now()}.csv`;
    link.href = url;
    link.click();
    showToast('Export Successful', 'success');
  };

  // Filter & Search parsing
  const filteredLinks = links
    .filter(link => {
      // 1. Search Query
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        (link.patient_name || '').toLowerCase().includes(q) ||
        (link.patient_id || '').toLowerCase().includes(q) ||
        (link.study_uid || '').toLowerCase().includes(q) ||
        (link.token || '').toLowerCase().includes(q);

      // 2. Status
      const statusLevel = getExpirationStatus(link).level;
      let matchesStatus = true;
      if (statusFilter === 'active') matchesStatus = statusLevel === 'active' || statusLevel === 'expiring';
      else if (statusFilter === 'expired') matchesStatus = statusLevel === 'expired';
      else if (statusFilter === 'revoked') matchesStatus = statusLevel === 'revoked';

      // 3. Permissions
      let matchesPerm = true;
      if (permissionFilter !== 'all') {
        matchesPerm = !!link.permissions?.[permissionFilter];
      }

      // 4. Date Range
      let matchesDate = true;
      if (dateFilter !== 'all') {
        const createdTime = new Date(link.created_at).getTime();
        const diffMs = Date.now() - createdTime;
        if (dateFilter === 'today') matchesDate = diffMs <= 24 * 3600 * 1000;
        else if (dateFilter === 'week') matchesDate = diffMs <= 7 * 24 * 3600 * 1000;
        else if (dateFilter === 'month') matchesDate = diffMs <= 30 * 24 * 3600 * 1000;
      }

      return matchesSearch && matchesStatus && matchesPerm && matchesDate;
    })
    .sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'patient_name') {
        valA = (a.patient_name || '').toLowerCase();
        valB = (b.patient_name || '').toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  // Pagination
  const totalPages = Math.ceil(filteredLinks.length / itemsPerPage) || 1;
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredLinks.slice(indexOfFirstItem, indexOfLastItem);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  // Dashboard Stats Calculations
  const statsTotal = links.length;
  const statsActive = links.filter(l => {
    const lvl = getExpirationStatus(l).level;
    return lvl === 'active' || lvl === 'expiring';
  }).length;
  const statsExpired = links.filter(l => getExpirationStatus(l).level === 'expired').length;
  const statsRevoked = links.filter(l => getExpirationStatus(l).level === 'revoked').length;
  const statsToday = links.filter(l => {
    const diff = Date.now() - new Date(l.created_at).getTime();
    return diff <= 24 * 3600 * 1000;
  }).length;

  const getMostOpenedStudy = () => {
    const studyCount: Record<string, number> = {};
    links.forEach(l => {
      if (l.study_description) {
        studyCount[l.study_description] = (studyCount[l.study_description] || 0) + 1;
      }
    });
    let best = 'None';
    let max = 0;
    Object.entries(studyCount).forEach(([k, v]) => {
      if (v > max) {
        max = v;
        best = k;
      }
    });
    return best;
  };

  // Drag columns sizing
  const handleMouseDownResize = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = colWidths[colKey] || 100;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      setColWidths(prev => ({
        ...prev,
        [colKey]: Math.max(50, startWidth + dx)
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Shift column ordering
  const shiftCol = (index: number, direction: 'left' | 'right') => {
    const newOrder = [...colOrder];
    const targetIdx = direction === 'left' ? index - 1 : index + 1;
    if (targetIdx >= 0 && targetIdx < newOrder.length) {
      const temp = newOrder[index];
      newOrder[index] = newOrder[targetIdx];
      newOrder[targetIdx] = temp;
      setColOrder(newOrder);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 z-[999] flex items-center justify-center p-4 backdrop-blur-xs select-none">
      <div 
        ref={dialogRef}
        tabIndex={-1}
        className="bg-[#1C1F26] border border-[#353C48] rounded-[6px] shadow-2xl max-w-[95vw] w-full flex flex-col h-[85vh] overflow-hidden focus:outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-manage-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#17191E] border-b border-[#353C48]">
          <h2 id="dialog-manage-title" className="text-sm font-bold text-white flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-[#3B82F6]" />
            Workstation Share Management Dashboard
          </h2>
          <button 
            onClick={onClose} 
            title="Close Dialog (Esc)"
            className="text-[#8B949E] hover:text-white transition-colors cursor-pointer outline-none"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Dashboard Statistics Panels */}
        <div className="p-3 bg-[#14171C] border-b border-[#353C48] grid grid-cols-2 sm:grid-cols-5 gap-3 font-sans">
          <div className="bg-[#1C1F26] border border-[#2A303C] rounded p-2 flex flex-col justify-center">
            <span className="text-[10px] uppercase text-[#8B949E] tracking-wider leading-none">Total Shares</span>
            <span className="text-lg font-bold text-white mt-1 leading-none font-mono">{statsTotal}</span>
          </div>
          <div className="bg-[#1C1F26] border border-[#2A303C] rounded p-2 flex flex-col justify-center">
            <span className="text-[10px] uppercase text-[#10B981] tracking-wider leading-none">Active</span>
            <span className="text-lg font-bold text-[#10B981] mt-1 leading-none font-mono">{statsActive}</span>
          </div>
          <div className="bg-[#1C1F26] border border-[#2A303C] rounded p-2 flex flex-col justify-center">
            <span className="text-[10px] uppercase text-[#EF4444] tracking-wider leading-none">Expired</span>
            <span className="text-lg font-bold text-[#EF4444] mt-1 leading-none font-mono">{statsExpired}</span>
          </div>
          <div className="bg-[#1C1F26] border border-[#2A303C] rounded p-2 flex flex-col justify-center">
            <span className="text-[10px] uppercase text-[#8B949E] tracking-wider leading-none">Revoked</span>
            <span className="text-lg font-bold text-[#8B949E] mt-1 leading-none font-mono">{statsRevoked}</span>
          </div>
          <div className="bg-[#1C1F26] border border-[#2A303C] rounded p-2 flex flex-col justify-center col-span-2 sm:col-span-1">
            <span className="text-[10px] uppercase text-[#3B82F6] tracking-wider leading-none">Created Today</span>
            <span className="text-lg font-bold text-[#3B82F6] mt-1 leading-none font-mono">{statsToday}</span>
          </div>
        </div>

        {/* Workspace: Table Grid (Left) + Detail Sidebar (Right) */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          
          {/* LEFT CONTAINER (Table, Search, Filters) */}
          <div className="flex-[2.2] flex flex-col border-r border-[#353C48] overflow-hidden min-h-0">
            
            {/* Filter controls */}
            <div className="p-3 bg-[#14171C]/50 border-b border-[#353C48] flex flex-wrap gap-2 items-center justify-between">
              {/* Search */}
              <div className="relative w-56">
                <Search className="absolute left-2 top-[7px] w-3.5 h-3.5 text-[#8B949E]" />
                <input
                  type="text"
                  placeholder="Filter name, ID, token..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="w-full bg-[#252B34] border border-[#353C48] rounded-[4px] pl-7 pr-3 py-1.2 text-[11px] font-sans text-white placeholder-[#8B949E] outline-none focus:border-[#3B82F6] transition-subtle"
                />
              </div>

              {/* Advanced Filter Selectors */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Status */}
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                  className="bg-[#252B34] border border-[#353C48] rounded-[4px] text-[11px] text-[#C9D1D9] py-1 px-1.5 outline-none font-sans"
                >
                  <option value="all">Status: All</option>
                  <option value="active">Active Only</option>
                  <option value="expired">Expired Only</option>
                  <option value="revoked">Revoked Only</option>
                </select>

                {/* Permission */}
                <select
                  value={permissionFilter}
                  onChange={(e) => { setPermissionFilter(e.target.value); setCurrentPage(1); }}
                  className="bg-[#252B34] border border-[#353C48] rounded-[4px] text-[11px] text-[#C9D1D9] py-1 px-1.5 outline-none font-sans"
                >
                  <option value="all">Perms: All</option>
                  <option value="view">View</option>
                  <option value="measure">Measure</option>
                  <option value="annotation">Annotate</option>
                  <option value="download">Download</option>
                </select>

                {/* Creation Date */}
                <select
                  value={dateFilter}
                  onChange={(e) => { setDateFilter(e.target.value); setCurrentPage(1); }}
                  className="bg-[#252B34] border border-[#353C48] rounded-[4px] text-[11px] text-[#C9D1D9] py-1 px-1.5 outline-none font-sans"
                >
                  <option value="all">Date: All</option>
                  <option value="today">Created: Today</option>
                  <option value="week">Past 7 Days</option>
                  <option value="month">Past 30 Days</option>
                </select>

                {/* CSV Export Button */}
                <button
                  onClick={handleExportLinksCSV}
                  title="Export List to CSV"
                  className="flex items-center gap-1 text-[11px] px-2 py-1 bg-[#252B34] border border-[#353C48] hover:bg-[#2C333E] text-[#C9D1D9] hover:text-white rounded transition-subtle cursor-pointer outline-none font-sans"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-green-500" />
                  Export
                </button>

                {/* Refresh */}
                <button 
                  onClick={fetchLinks}
                  disabled={loading}
                  title="Refresh link table"
                  className="flex items-center justify-center p-1.5 rounded bg-[#252B34] border border-[#353C48] hover:bg-[#2C333E] text-[#C9D1D9] hover:text-white disabled:opacity-40 disabled:pointer-events-none transition-subtle cursor-pointer outline-none"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Grid display */}
            <div className="flex-1 overflow-auto p-3 min-h-0 bg-[#14171C]/25">
              {loading ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-[#8B949E]">
                  <span className="w-8 h-8 border-4 border-[#3B82F6]/30 border-t-[#3B82F6] rounded-full animate-spin"></span>
                  <span className="text-[12px] font-sans italic">Loading shares database...</span>
                </div>
              ) : currentItems.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-[#8B949E] text-center p-6 border border-[#252B34] rounded bg-[#14171C]">
                  <Filter className="w-8 h-8 text-[#353C48]" />
                  <span className="text-[12px] font-sans font-semibold text-[#C9D1D9]">No Share Links Match Filters</span>
                  <span className="text-[11px] max-w-sm">Refine your search or clear filters to retrieve workstation records.</span>
                </div>
              ) : (
                <div className="border border-[#353C48] rounded bg-[#14171C] flex flex-col h-full overflow-hidden">
                  <div className="overflow-x-auto flex-1 no-scrollbar relative">
                    <table className="text-left text-[11px] font-sans border-collapse table-fixed min-w-full">
                      <thead>
                        <tr className="bg-[#17191E] border-b border-[#353C48] text-[#8B949E] font-bold select-none h-8 sticky top-0 z-10">
                          {colOrder.map((colKey, index) => (
                            <th 
                              key={colKey}
                              style={{ width: `${colWidths[colKey] || 100}px` }}
                              className="px-2 py-1.5 relative border-r border-[#2C333E]/50 group"
                            >
                              <div className="flex items-center justify-between min-w-0 h-full">
                                <span 
                                  className="truncate cursor-pointer hover:text-white flex-1 pr-1"
                                  onClick={() => handleSort(colKey)}
                                  title={columnHeaders[colKey]}
                                >
                                  {columnHeaders[colKey]}
                                  {sortField === colKey ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                                </span>
                                {/* Column Shifters */}
                                <div className="hidden group-hover:flex items-center gap-0.5 ml-1 shrink-0 bg-[#17191E] pl-1">
                                  {index > 0 && (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); shiftCol(index, 'left'); }}
                                      className="hover:text-white p-0.5" 
                                      title="Shift Column Left"
                                    >
                                      ◀
                                    </button>
                                  )}
                                  {index < colOrder.length - 1 && (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); shiftCol(index, 'right'); }}
                                      className="hover:text-white p-0.5" 
                                      title="Shift Column Right"
                                    >
                                      ▶
                                    </button>
                                  )}
                                </div>
                              </div>
                              {/* Drag resize handle */}
                              <div 
                                onMouseDown={(e) => handleMouseDownResize(colKey, e)}
                                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#3B82F6]" 
                              />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#252B34] text-[#C9D1D9]">
                        {currentItems.map((link) => {
                          const status = getExpirationStatus(link);
                          const isSelected = selectedLink?.token === link.token;
                          return (
                            <tr 
                              key={link.token} 
                              onClick={() => setSelectedLink(link)}
                              className={`h-9 transition-colors cursor-default ${
                                isSelected ? 'bg-[#3B82F6]/15 hover:bg-[#3B82F6]/20' : 'hover:bg-[#1E222B]'
                              }`}
                            >
                              {colOrder.map((colKey) => {
                                let content: React.ReactNode = null;

                                if (colKey === 'patient_name') {
                                  content = <span className="font-semibold text-white truncate block select-text" title={link.patient_name}>{link.patient_name}</span>;
                                } else if (colKey === 'patient_id') {
                                  content = <span className="font-mono text-[#8B949E] select-text truncate block">{link.patient_id || 'Unknown'}</span>;
                                } else if (colKey === 'study_description') {
                                  content = <span className="italic truncate block" title={link.study_description}>{link.study_description}</span>;
                                } else if (colKey === 'study_uid') {
                                  content = <span className="font-mono text-[#8B949E] truncate block select-text" title={link.study_uid}>{link.study_uid}</span>;
                                } else if (colKey === 'token') {
                                  content = <span className="font-mono text-white/90 select-text">{link.token}</span>;
                                } else if (colKey === 'created_at') {
                                  content = <span className="font-mono text-[#8B949E]">{new Date(link.created_at).toLocaleDateString()}</span>;
                                } else if (colKey === 'expires_at') {
                                  content = <span className="font-mono">{link.expires_at ? new Date(link.expires_at).toLocaleDateString() : 'Never'}</span>;
                                } else if (colKey === 'last_accessed') {
                                  content = <span className="font-mono text-[#8B949E]">{link.last_accessed ? new Date(link.last_accessed).toLocaleDateString() : 'Never'}</span>;
                                } else if (colKey === 'status') {
                                  content = (
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${status.bgClass} ${status.textClass} tracking-wide`}>
                                      {status.label}
                                    </span>
                                  );
                                } else if (colKey === 'permissions') {
                                  const p = link.permissions || {};
                                  content = (
                                    <div className="flex gap-0.5 justify-start text-[8px] font-semibold text-[#8B949E]">
                                      {p.view && <span className="bg-[#252B34] border border-[#353C48] px-0.5 rounded flex items-center justify-center w-3 h-3 text-white">V</span>}
                                      {p.measure && <span className="bg-[#252B34] border border-[#353C48] px-0.5 rounded flex items-center justify-center w-3 h-3 text-white">M</span>}
                                      {p.annotation && <span className="bg-[#252B34] border border-[#353C48] px-0.5 rounded flex items-center justify-center w-3 h-3 text-white">A</span>}
                                      {p.download && <span className="bg-[#252B34] border border-[#353C48] px-0.5 rounded flex items-center justify-center w-3 h-3 text-white">D</span>}
                                    </div>
                                  );
                                } else if (colKey === 'password_protected') {
                                  content = link.password_protected ? (
                                    <span className="bg-[#1E293B] border border-[#3B82F6]/30 text-[#3B82F6] text-[8.5px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 max-w-fit leading-none">
                                      <Lock className="w-2.5 h-2.5" /> Key
                                    </span>
                                  ) : (
                                    <span className="text-[#555] font-mono text-[9px]">None</span>
                                  );
                                }

                                return (
                                  <td key={colKey} className="px-2 py-1 overflow-hidden whitespace-nowrap">
                                    {content}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination footer */}
                  <div className="bg-[#17191E] border-t border-[#353C48] px-3 py-1.5 flex items-center justify-between select-none">
                    <span className="text-[10px] text-[#8B949E]">
                      Showing <span className="font-semibold text-white">{indexOfFirstItem + 1}</span> to{' '}
                      <span className="font-semibold text-white">{Math.min(indexOfLastItem, filteredLinks.length)}</span> of{' '}
                      <span className="font-semibold text-white">{filteredLinks.length}</span> records
                    </span>
                    
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="p-0.5 rounded bg-[#252B34] border border-[#353C48] text-[#C9D1D9] hover:text-white disabled:opacity-30 disabled:pointer-events-none cursor-pointer outline-none"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[10px] font-sans text-white px-2">
                        Page {currentPage} / {totalPages}
                      </span>
                      <button 
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="p-0.5 rounded bg-[#252B34] border border-[#353C48] text-[#C9D1D9] hover:text-white disabled:opacity-30 disabled:pointer-events-none cursor-pointer outline-none"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Dashboard details */}
            <div className="p-3 bg-[#14171C] border-t border-[#353C48] flex items-center justify-between text-[11px] text-[#8B949E] font-sans leading-tight">
              <div className="flex items-center gap-1 truncate max-w-[70%]">
                <Info className="w-3.5 h-3.5 text-[#3B82F6] shrink-0" />
                <span>Most Shared Study: <strong className="text-white italic select-all">{getMostOpenedStudy()}</strong></span>
              </div>
              <span className="italic text-[10px]">Select a study row to edit configurations</span>
            </div>
          </div>

          {/* RIGHT CONTAINER (Details Sidebar Editor) */}
          <div className="flex-1 flex flex-col bg-[#14171C] overflow-y-auto no-scrollbar min-h-0 font-sans text-[11px]">
            {!selectedLink ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 text-[#555860] gap-2">
                <Info className="w-10 h-10 text-[#252B34]" />
                <h3 className="font-bold text-[12px] text-[#8B949E]">No Link Selected</h3>
                <p className="max-w-[200px] text-[10.5px]">Select a link in the grid to configure credentials, permissions, QR tools, or review logs.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 p-4">
                
                {/* Section A: Patient & Study details */}
                <div>
                  <h3 className="text-white text-[12px] font-bold border-b border-[#353C48] pb-1 flex items-center justify-between">
                    <span>Study Metadata</span>
                    <span className="text-[10px] font-mono text-[#8B949E] select-all">#{selectedLink.token}</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-2 mt-2 leading-snug">
                    <div>
                      <span className="text-[#8B949E] block">Patient Name</span>
                      <strong className="text-white block select-all">{selectedLink.patient_name}</strong>
                    </div>
                    <div>
                      <span className="text-[#8B949E] block">Patient ID</span>
                      <strong className="text-white block select-all font-mono">{selectedLink.patient_id || 'Unknown'}</strong>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[#8B949E] block">Description</span>
                      <span className="text-[#C9D1D9] italic block">{selectedLink.study_description}</span>
                    </div>
                  </div>
                </div>

                {/* Section B: Global Actions */}
                <div className="flex flex-col gap-1.5 bg-[#1C1F26] border border-[#353C48] rounded p-2.5">
                  <span className="text-white font-bold block mb-1">Actions</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleCopyLink(selectedLink.token)}
                      className="flex items-center justify-center gap-1 px-3 py-1.5 bg-[#252B34] hover:bg-[#2C333E] border border-[#353C48] text-white rounded cursor-pointer transition-subtle outline-none font-semibold"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy URL
                    </button>
                    <button
                      onClick={() => handleOpenLink(selectedLink.token)}
                      className="flex items-center justify-center gap-1 px-3 py-1.5 bg-[#252B34] hover:bg-[#2C333E] border border-[#353C48] text-white rounded cursor-pointer transition-subtle outline-none font-semibold"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Launch
                    </button>
                    <button
                      onClick={() => handleRevoke(selectedLink.token)}
                      disabled={selectedLink.revoked}
                      className="flex items-center justify-center gap-1 px-3 py-1.5 bg-[#2A1D1F] border border-[#522A2D] text-[#EF4444] hover:bg-[#EF4444] hover:text-white disabled:opacity-30 disabled:pointer-events-none rounded cursor-pointer transition-subtle outline-none font-semibold"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Revoke Access
                    </button>
                    <button
                      onClick={() => handleDelete(selectedLink.token)}
                      className="flex items-center justify-center gap-1 px-3 py-1.5 bg-[#3D1418] border border-[#6E1E24] text-[#EF4444] hover:bg-[#EF4444] hover:text-white rounded cursor-pointer transition-subtle outline-none font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Link
                    </button>
                  </div>
                </div>

                {/* Section C: Expiration date extender */}
                <div>
                  <h3 className="text-white text-[12px] font-bold border-b border-[#353C48] pb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#3B82F6]" /> Link Expiration
                  </h3>
                  <div className="flex flex-col gap-2 mt-2">
                    <div className="flex gap-2">
                      <select 
                        value={extensionDays}
                        onChange={(e) => setExtensionDays(e.target.value)}
                        className="flex-1 bg-[#252B34] border border-[#353C48] rounded-[4px] text-[11px] text-white p-1.5 outline-none focus:border-[#3B82F6]"
                      >
                        <option value="1">Extend +24 Hours</option>
                        <option value="7">Extend +7 Days</option>
                        <option value="30">Extend +30 Days</option>
                        <option value="90">Extend +90 Days</option>
                        <option value="never">Remove Expiry (Never)</option>
                        <option value="custom">Set Custom Date</option>
                      </select>
                      <button
                        onClick={handleExtendExpiry}
                        className="px-3.5 bg-[#3B82F6] hover:bg-[#2563EB] text-white rounded cursor-pointer transition-subtle outline-none font-bold"
                      >
                        Apply
                      </button>
                    </div>

                    {extensionDays === 'custom' && (
                      <input
                        type="date"
                        value={customExpiryDate}
                        onChange={(e) => setCustomExpiryDate(e.target.value)}
                        className="bg-[#252B34] border border-[#353C48] rounded-[4px] text-[11px] text-white p-1.5 outline-none focus:border-[#3B82F6]"
                      />
                    )}
                  </div>
                </div>

                {/* Section D: Permission check list editor */}
                <div>
                  <h3 className="text-white text-[12px] font-bold border-b border-[#353C48] pb-1 flex items-center gap-1">
                    <CheckSquare className="w-3.5 h-3.5 text-[#3B82F6]" /> Sharing Permissions
                  </h3>
                  <div className="flex flex-col gap-2.5 mt-2 bg-[#1C1F26] border border-[#353C48] rounded p-2.5 text-[#C9D1D9]">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        checked={!!selectedLink.permissions?.view}
                        onChange={(e) => handleTogglePermission('view', e.target.checked)}
                        className="accent-[#3B82F6] rounded"
                      />
                      <div>
                        <span className="font-semibold block leading-none">View Images</span>
                        <span className="text-[9.5px] text-[#8B949E]">View study slices in viewport</span>
                      </div>
                    </label>
                    
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        checked={!!selectedLink.permissions?.measure}
                        onChange={(e) => handleTogglePermission('measure', e.target.checked)}
                        className="accent-[#3B82F6] rounded"
                      />
                      <div>
                        <span className="font-semibold block leading-none">Use Measurements</span>
                        <span className="text-[9.5px] text-[#8B949E]">Enable rulers, angles, and pixel probe</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        checked={!!selectedLink.permissions?.annotation}
                        onChange={(e) => handleTogglePermission('annotation', e.target.checked)}
                        className="accent-[#3B82F6] rounded"
                      />
                      <div>
                        <span className="font-semibold block leading-none">Use Annotations</span>
                        <span className="text-[9.5px] text-[#8B949E]">Draw arrows, rectangles, and text tags</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        checked={!!selectedLink.permissions?.pdf}
                        onChange={(e) => handleTogglePermission('pdf', e.target.checked)}
                        className="accent-[#3B82F6] rounded"
                      />
                      <div>
                        <span className="font-semibold block leading-none">Download PDF Report</span>
                        <span className="text-[9.5px] text-[#8B949E]">Export clinical PDF summaries</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        checked={!!selectedLink.permissions?.download}
                        onChange={(e) => handleTogglePermission('download', e.target.checked)}
                        className="accent-[#3B82F6] rounded"
                      />
                      <div>
                        <span className="font-semibold block leading-none">Download raw DICOM</span>
                        <span className="text-[9.5px] text-[#8B949E]">Export offline DICOM files</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Section E: Password manager */}
                <div>
                  <h3 className="text-white text-[12px] font-bold border-b border-[#353C48] pb-1 flex items-center gap-1">
                    <Key className="w-3.5 h-3.5 text-[#3B82F6]" /> Password Protection
                  </h3>
                  <div className="mt-2">
                    {selectedLink.password_protected ? (
                      <div className="flex flex-col gap-2">
                        <div className="bg-[#1D2433] border border-[#3B82F6]/30 rounded p-2 text-[#3B82F6] font-semibold flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5" />
                          Password Verification Active
                        </div>
                        <div className="flex gap-2 text-[10px]">
                          <button
                            onClick={() => setShowPasswordForm(!showPasswordForm)}
                            className="flex-1 bg-[#252B34] border border-[#353C48] hover:bg-[#2C333E] text-white py-1.5 rounded cursor-pointer transition-subtle outline-none"
                          >
                            Change Password
                          </button>
                          <button
                            onClick={() => handleUpdatePassword(null)}
                            className="flex-1 bg-[#2D1D20] border border-[#522D30] text-[#EF4444] hover:bg-[#EF4444] hover:text-white py-1.5 rounded cursor-pointer transition-subtle outline-none"
                          >
                            Remove Password
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowPasswordForm(!showPasswordForm)}
                        className="w-full bg-[#252B34] border border-[#353C48] hover:bg-[#2C333E] text-white p-2 rounded flex items-center justify-center gap-1.5 cursor-pointer outline-none transition-subtle"
                      >
                        <Unlock className="w-3.5 h-3.5 text-[#8B949E]" />
                        Enable Password Protection
                      </button>
                    )}

                    {showPasswordForm && (
                      <div className="mt-2.5 bg-[#1C1F26] border border-[#353C48] rounded p-2.5 flex flex-col gap-2">
                        <input
                          type="password"
                          placeholder="Enter new security password..."
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                          className="bg-[#252B34] border border-[#353C48] rounded text-white text-[11px] p-2 outline-none focus:border-[#3B82F6]"
                        />
                        <div className="flex justify-end gap-1 text-[10.5px]">
                          <button
                            onClick={() => handleUpdatePassword(passwordInput)}
                            disabled={!passwordInput.trim()}
                            className="bg-[#3B82F6] hover:bg-[#2563EB] disabled:bg-[#3b82f6]/30 text-white px-3 py-1 rounded cursor-pointer font-bold transition-subtle"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setShowPasswordForm(false); setPasswordInput(''); }}
                            className="bg-transparent border border-[#353C48] hover:bg-[#252B34] text-[#C9D1D9] px-3 py-1 rounded cursor-pointer transition-subtle"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section F: QR Code Utility */}
                <div>
                  <h3 className="text-white text-[12px] font-bold border-b border-[#353C48] pb-1 flex items-center gap-1">
                    <QrCode className="w-3.5 h-3.5 text-[#3B82F6]" /> QR Code Generator
                  </h3>
                  <div className="mt-2 flex flex-col items-center gap-2 bg-[#1C1F26] border border-[#353C48] rounded p-3">
                    <canvas ref={qrCanvasRef} className="rounded bg-white p-1" />
                    <div className="flex gap-1.5 w-full mt-1">
                      <button
                        onClick={handleSaveQR}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-[#252B34] border border-[#353C48] hover:bg-[#2C333E] text-white rounded cursor-pointer transition-subtle outline-none"
                      >
                        <Download className="w-3.5 h-3.5 text-green-500" />
                        Save PNG
                      </button>
                      <button
                        onClick={handlePrintQR}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-[#252B34] border border-[#353C48] hover:bg-[#2C333E] text-white rounded cursor-pointer transition-subtle outline-none"
                      >
                        <Printer className="w-3.5 h-3.5 text-blue-500" />
                        Print QR
                      </button>
                    </div>
                  </div>
                </div>

                {/* Section G: Audit log history list */}
                <div>
                  <h3 className="text-white text-[12px] font-bold border-b border-[#353C48] pb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-[#3B82F6]" /> Access Traces</span>
                    <button
                      onClick={handleExportAuditCSV}
                      disabled={auditLogs.length === 0}
                      title="Export Audits to CSV"
                      className="text-[10px] text-[#C9D1D9] hover:text-white flex items-center gap-0.5 cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <FileSpreadsheet className="w-3 h-3 text-green-500" /> Export
                    </button>
                  </h3>
                  <div className="mt-2 max-h-[180px] overflow-y-auto border border-[#353C48]/50 rounded bg-[#14171C] divide-y divide-[#252B34]/60 no-scrollbar select-text">
                    {loadingAudit ? (
                      <span className="text-[#8B949E] italic block p-3 text-center">Loading histories...</span>
                    ) : auditLogs.length === 0 ? (
                      <span className="text-[#555] italic block p-3 text-center">No logs recorded</span>
                    ) : (
                      auditLogs.map((log) => (
                        <div key={log.id} className="p-2 text-[10px] flex flex-col gap-0.5 leading-normal">
                          <div className="flex justify-between items-center text-white font-semibold">
                            <span className="uppercase text-[#3B82F6]">{log.action.replace('UPDATE_', 'EDIT ')}</span>
                            <span className="text-[#8B949E] font-mono">{new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                          <div className="flex justify-between text-[#8B949E] font-mono mt-0.5">
                            <span>{log.ip_address || '127.0.0.1'}</span>
                            <span>{log.browser || 'Unknown'} / {log.device || 'PC'}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="flex justify-between px-4 py-3 bg-[#17191E] border-t border-[#353C48] select-none text-[11.5px] text-[#8B949E]">
          <span className="font-mono italic">Workstation Node Base Connected Successfully</span>
          <button
            onClick={onClose}
            className="px-4 py-1 bg-[#252B34] border border-[#353C48] rounded hover:bg-[#2A323D] text-[11.5px] font-sans text-white cursor-pointer transition-subtle outline-none"
          >
            Close Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
