const { contextBridge, ipcRenderer } = require('electron');

console.log('[MerilView] Preload script initialized successfully (CommonJS).');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  reload: () => ipcRenderer.send('window-reload'),
  toggleDevTools: () => ipcRenderer.send('window-toggle-devtools'),
  getMaximized: () => ipcRenderer.invoke('window-get-maximized'),
  openFiles: () => ipcRenderer.invoke('dialog-open-files'),
  openFolder: () => ipcRenderer.invoke('dialog-open-folder'),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  copyImage: (dataUrl) => ipcRenderer.invoke('copy-image-to-clipboard', dataUrl),
  saveImage: (dataUrl, defaultName) => ipcRenderer.invoke('save-image-dialog', dataUrl, defaultName),
  onOpenSharedStudy: (callback) => {
    const subscription = (_event, token) => callback(token);
    ipcRenderer.on('open-shared-study', subscription);
    return () => {
      ipcRenderer.removeListener('open-shared-study', subscription);
    };
  },
  openStudy: (studyInstanceUID) => ipcRenderer.send('navigate-to-study', studyInstanceUID),
  onOpenStudy: (callback) => {
    const subscription = (_event, uid) => callback(uid);
    ipcRenderer.on('open-study', subscription);
    return () => {
      ipcRenderer.removeListener('open-study', subscription);
    };
  },
  onMaximizedStatus: (callback) => {
    const subscription = (_event, status) => callback(status);
    ipcRenderer.on('window-maximize-status', subscription);
    return () => {
      ipcRenderer.removeListener('window-maximize-status', subscription);
    };
  },
  getServicesStatus: () => ipcRenderer.invoke('get-services-status'),
  retryServices: () => ipcRenderer.invoke('retry-services'),
  openLogsFolder: () => ipcRenderer.send('open-logs-folder'),
  getStartupStudy: () => ipcRenderer.invoke('get-startup-study'),
  getStartupShare: () => ipcRenderer.invoke('get-startup-share'),
});
