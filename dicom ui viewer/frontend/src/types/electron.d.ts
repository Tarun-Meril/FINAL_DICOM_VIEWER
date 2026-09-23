export interface IElectronAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  getMaximized: () => Promise<boolean>;
  copyText: (text: string) => Promise<boolean>;
  openExternal: (url: string) => void;
  copyImage: (dataUrl: string) => Promise<boolean>;
  saveImage: (dataUrl: string, defaultName: string) => Promise<boolean>;
  onOpenSharedStudy: (callback: (token: string) => void) => () => void;
  onMaximizedStatus: (callback: (status: boolean) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
  }
}
