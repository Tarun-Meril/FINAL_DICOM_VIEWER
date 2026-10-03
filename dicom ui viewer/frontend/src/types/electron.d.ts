export interface IElectronAPI {
  isElectron?: boolean;
  platform?: string;
  versions?: {
    electron?: string;
    chrome?: string;
    node?: string;
  };
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  reload?: () => void;
  toggleDevTools?: () => void;
  getMaximized: () => Promise<boolean>;
  copyText: (text: string) => Promise<boolean>;
  openExternal: (url: string) => void;
  copyImage: (dataUrl: string) => Promise<boolean>;
  saveImage: (dataUrl: string, defaultName: string) => Promise<boolean>;
  openFiles: () => Promise<any[]>;
  openFolder: () => Promise<any[]>;
  openStudy: (studyInstanceUID: string) => void;
  onOpenSharedStudy: (callback: (token: string) => void) => () => void;
  onOpenStudy: (callback: (studyInstanceUID: string) => void) => () => void;
  onMaximizedStatus: (callback: (status: boolean) => void) => () => void;
  getServicesStatus?: () => Promise<{ pacs: boolean; backend: boolean; programDataDir: string; error?: string }>;
  retryServices?: () => Promise<boolean>;
  openLogsFolder?: () => void;
  getStartupStudy?: () => Promise<string | null>;
  getStartupShare?: () => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
  }
}
