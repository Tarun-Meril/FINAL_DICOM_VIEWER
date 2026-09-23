import React from 'react';
import { Database, Folder, Settings, Moon, Upload, RefreshCw, Download, XCircle, Sun } from 'lucide-react';
import logo from '../logo.png';

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
  onClearFilters: () => void;
  onImportClick: () => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  activeTab,
  setActiveTab,
  onRefresh,
  isLoading,
  onClearFilters,
  onImportClick
}) => {
  const [isNightMode, setIsNightMode] = React.useState(true);

  return (
    <div className="app-container">
      {/* Left Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand" style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logo} alt="Meril" style={{ height: '32px', width: 'auto', display: 'block' }} />
        </div>

        <div className="sidebar-section-title">Workspace</div>
        <div className="sidebar-menu">
          <button
            className={`sidebar-item ${activeTab === 'browser' ? 'active' : ''}`}
            onClick={() => setActiveTab('browser')}
          >
            <Database size={18} />
            Imaging Records
          </button>
          <button
            className={`sidebar-item ${activeTab === 'local' ? 'active' : ''}`}
            onClick={() => setActiveTab('local')}
          >
            <Folder size={18} />
            Local Archives
          </button>
        </div>

        <div className="sidebar-section-title">System</div>
        <div className="sidebar-menu">
          <button
            className={`sidebar-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={18} />
            Preferences
          </button>
        </div>

        {/* Night Mode Toggle at bottom */}
        <div className="sidebar-footer">
          <button 
            className="sidebar-item" 
            style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', width: '100%' }}
            onClick={() => setIsNightMode(!isNightMode)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {isNightMode ? <Moon size={18} /> : <Sun size={18} />}
              Night mode
            </div>
            <div style={{
              width: '32px',
              height: '18px',
              borderRadius: '9px',
              backgroundColor: isNightMode ? 'var(--color-accent)' : 'var(--text-muted)',
              position: 'relative',
              transition: 'var(--transition-smooth)'
            }}>
              <div style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                backgroundColor: 'white',
                position: 'absolute',
                top: '2px',
                left: isNightMode ? '16px' : '2px',
                transition: 'var(--transition-smooth)'
              }} />
            </div>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-layout">
        <header className="top-header">
          <div className="header-title-area">
            <h2 className="header-title">Imaging Records</h2>
            <span className="header-badge">PACS Study Browser</span>
          </div>

          <div className="header-actions">
            <button className="pacs-btn pacs-btn-blue" onClick={onImportClick}>
              <Upload size={16} />
              Import Study
            </button>
            <button className="pacs-btn pacs-btn-blue" onClick={onRefresh} disabled={isLoading}>
              <RefreshCw size={16} className={isLoading ? 'spin-animation' : ''} />
              Refresh
            </button>
            <button className="pacs-btn pacs-btn-blue" onClick={() => alert('Exporting selected records...')}>
              <Download size={16} />
              Export
            </button>
            <button className="pacs-btn pacs-btn-blue" onClick={onClearFilters}>
              <XCircle size={16} />
              Clear Filters
            </button>
            <button 
              className="pacs-btn pacs-btn-outline" 
              style={{ padding: '0 10px' }}
              onClick={() => setActiveTab('settings')}
            >
              <Settings size={16} />
            </button>
          </div>
        </header>

        {/* Dynamic page area */}
        <div className="page-grid">
          {children}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin-animation {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};
export default DashboardLayout;
