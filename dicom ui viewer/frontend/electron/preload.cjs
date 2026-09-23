const { contextBridge, ipcRenderer } = require('electron');

console.log('[MedView PRO] Preload script initialized successfully (CommonJS).');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
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
  onMaximizedStatus: (callback) => {
    const subscription = (_event, status) => callback(status);
    ipcRenderer.on('window-maximize-status', subscription);
    return () => {
      ipcRenderer.removeListener('window-maximize-status', subscription);
    };
  },
});
