import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeImage, session, protocol, net } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { ServiceManager } from './serviceManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let viewerDevUrl = 'http://localhost:5174';
try {
  const configPath = path.join(__dirname, '../../../viewer.config.json');
  if (fs.existsSync(configPath)) {
    const viewerConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    viewerDevUrl = viewerConfig.baseUrl || viewerDevUrl;
  }
} catch (_) {}

// Register custom privileged scheme 'app' so ES module workers and WebAssembly work with a standard origin
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

// Initialize Windows Service & Data Storage Manager
const serviceManager = new ServiceManager(__dirname);

// Enable GPU and WebGL hardware acceleration required by Cornerstone3D and VTK.js MPR/VR rendering
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');
// Allow up to 64 simultaneous active WebGL contexts so multi-viewport MPR & 2D rendering never trigger context loss
app.commandLine.appendSwitch('max-active-webgl-contexts', '64');
app.commandLine.appendSwitch('enable-webgl');
app.commandLine.appendSwitch('enable-zero-copy');
// Prevent GPU shader cache disk creation errors on Windows without disabling GPU
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('allow-file-access-from-files');

// Protocol Scheme Client for deep linking (merilview:// with backward-compatible medview:// support)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('merilview', process.execPath, [path.resolve(process.argv[1])]);
    app.setAsDefaultProtocolClient('medview', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('merilview');
  app.setAsDefaultProtocolClient('medview');
}

let mainWindow = null;
let startupDeepLinkUrl = null;
let startupStudyUid = null;
let startupShareToken = null;

// Parse initial arguments on startup (Windows and Linux deep linking for both merilview:// and medview://)
const deepLinkUrl = process.argv.find(arg => arg.startsWith('merilview://') || arg.startsWith('medview://'));
if (deepLinkUrl) {
  startupDeepLinkUrl = deepLinkUrl;
  try {
    handleDeepLink(deepLinkUrl);
  } catch (e) { }
}

// macOS deep-linking listener
app.on('open-url', (event, url) => {
  event.preventDefault();
  startupDeepLinkUrl = url;
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    handleDeepLink(url);
  }
});

// Single Instance Lock — only enforce in production to avoid dev restart issues
const gotTheLock = app.isPackaged ? app.requestSingleInstanceLock() : true;
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      const url = commandLine.find(arg => arg.startsWith('merilview://') || arg.startsWith('medview://'));
      if (url) {
        handleDeepLink(url);
      }
    }
  });
}

function handleDeepLink(url) {
  if (!url || (!url.startsWith('merilview://') && !url.startsWith('medview://'))) return;

  try {
    const prefix = url.startsWith('merilview://') ? 'merilview://' : 'medview://';
    const route = url.substring(prefix.length);
    if (route.startsWith('share/')) {
      const parts = route.split('/');
      if (parts[1]) {
        const token = parts[1].split('?')[0];
        startupShareToken = token;
        if (mainWindow) {
          mainWindow.webContents.send('open-shared-study', token);
        }
      }
    } else if (route.startsWith('viewer') || route.startsWith('open')) {
      let uid = null;
      if (route.includes('=')) {
        try {
          const dummy = new URL(url.replace(prefix, 'http://localhost/'));
          uid = dummy.searchParams.get('studyInstanceUID') || dummy.searchParams.get('studyUID') || dummy.searchParams.get('studyUid');
        } catch (e) { }
      }
      if (!uid) {
        const parts = route.replace(/^\/?(viewer|open)\/?/, '').split('/');
        if (parts[0]) {
          uid = parts[0].split('?')[0];
        }
      }
      if (uid) {
        startupStudyUid = uid;
        console.log(`[MerilView] Deep link resolved study UID: ${uid}`);
        if (mainWindow) {
          mainWindow.webContents.send('open-study', uid);
        }
      }
    }
  } catch (err) {
    console.error('[MerilView] Deep-link parsing error:', err);
  }
}

function createWindow() {
  const iconCandidates = [
    path.join(__dirname, '../build/icons/512x512.png'),
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, '../src/logo.png'),
  ];
  const appIcon = iconCandidates.find(p => fs.existsSync(p));

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    frame: false, // frameless window
    backgroundColor: '#0B0D10',
    title: 'MerilView',
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Must be false so ipcRenderer works via contextBridge preload
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
  });

  // Enable F12 DevTools and F5 Reload in development & production
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
      } else if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
        mainWindow.webContents.reload();
        event.preventDefault();
      }
    }
  });

  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`[Renderer] ${message}`);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.show();
    mainWindow.focus();
    if (startupDeepLinkUrl) {
      handleDeepLink(startupDeepLinkUrl);
      startupDeepLinkUrl = null;
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Renderer] Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log(`[Renderer] Retrying load: ${validatedURL}`);
        mainWindow.loadURL(validatedURL).catch(() => {});
      }
    }, 1500);
  });

  // Load URL
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(viewerDevUrl).catch(() => {
      setTimeout(() => {
        mainWindow.loadURL(viewerDevUrl);
      }, 1000);
    });
  } else if (!app.isPackaged) {
    // In unpackaged development testing, try Vite dev server first, fall back to app://
    mainWindow.loadURL(viewerDevUrl).catch(() => {
      mainWindow.loadURL('app://localhost/index.html?apiHost=http://127.0.0.1:3001').catch(() => {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
      });
    });
  } else {
    // In production, load the built app via privileged protocol scheme so Web Workers, WASM and CORS work natively
    mainWindow.loadURL('app://localhost/index.html?apiHost=http://127.0.0.1:3001');
  }

  // Monitor maximize / unmaximize events and notify renderer
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximize-status', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximize-status', false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Handle custom 'app://' protocol to serve the packaged frontend distribution
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/' || pathname === '') {
        pathname = '/index.html';
      }
      let filePath = path.join(__dirname, '../dist', pathname);

      // Handle WASM asset lookups across potential directories
      if (!fs.existsSync(filePath) && pathname.endsWith('.wasm')) {
        const wasmName = path.basename(pathname);
        const candidates = [
          path.join(__dirname, '../dist/wasm', wasmName),
          path.join(__dirname, '../dist/assets/wasm', wasmName),
          path.join(__dirname, '../dist/assets', wasmName),
          path.join(__dirname, '../public/wasm', wasmName),
        ];
        for (const cand of candidates) {
          if (fs.existsSync(cand)) {
            filePath = cand;
            break;
          }
        }
      }

      // If file does not exist, fall back to index.html for SPA client-side routing
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(__dirname, '../dist/index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html; charset=UTF-8',
        '.js': 'text/javascript; charset=UTF-8',
        '.mjs': 'text/javascript; charset=UTF-8',
        '.css': 'text/css; charset=UTF-8',
        '.json': 'application/json; charset=UTF-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.wasm': 'application/wasm',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      const fileData = await fs.promises.readFile(filePath);

      return new Response(fileData, {
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
        },
      });
    } catch (err) {
      console.error('[Protocol app] Error handling request:', err);
      return new Response('File not found', { status: 404 });
    }
  });

  const startPromise = serviceManager.startServices();
  createWindow();
  await startPromise;

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  serviceManager.shutdown();
});

// Graceful terminal signal termination for Ubuntu / Linux
process.on('SIGTERM', () => {
  console.log('[MerilView] Received SIGTERM signal. Quitting application...');
  app.quit();
});

process.on('SIGINT', () => {
  console.log('[MerilView] Received SIGINT signal. Quitting application...');
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Window controls IPC Listeners
ipcMain.on('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win) win.minimize();
});

ipcMain.on('window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win) win.close();
});

// Check initial maximize state
ipcMain.handle('window-get-maximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  return win ? win.isMaximized() : false;
});

// Native File dialog handler
ipcMain.handle('dialog-open-files', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const result = await dialog.showOpenDialog(win, {
    title: 'Open DICOM Files',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'DICOM Files', extensions: ['dcm', 'DCM', '*'] }
    ]
  });
  if (result.canceled) return [];

  const files = [];
  for (const filePath of result.filePaths) {
    try {
      const data = fs.readFileSync(filePath);
      files.push({
        name: path.basename(filePath),
        data: data.buffer
      });
    } catch (err) {
      console.error('Failed to read file:', filePath, err);
    }
  }
  return files;
});

// Native Folder dialog handler
ipcMain.handle('dialog-open-folder', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const result = await dialog.showOpenDialog(win, {
    title: 'Open DICOM Folder',
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return [];

  const dirPath = result.filePaths[0];
  const files = [];

  function readDir(dir) {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        readDir(filePath);
      } else {
        if (files.length >= 5000) break;
        if (!file.startsWith('.')) {
          try {
            const data = fs.readFileSync(filePath);
            files.push({
              name: file,
              data: data.buffer
            });
          } catch (err) {
            console.error('Failed to read file:', filePath, err);
          }
        }
      }
    }
  }

  try {
    readDir(dirPath);
  } catch (err) {
    console.error('Error reading directory:', dirPath, err);
  }
  return files;
});

// Share study module desktop native helpers
ipcMain.handle('copy-text', async (event, text) => {
  clipboard.writeText(text);
  return true;
});

ipcMain.on('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
  } catch (err) {
    console.error('Failed to open external URL:', err);
  }
});

ipcMain.handle('copy-image-to-clipboard', async (event, dataUrl) => {
  try {
    const image = nativeImage.createFromDataURL(dataUrl);
    clipboard.writeImage(image);
    return true;
  } catch (err) {
    console.error('Failed to copy image to clipboard:', err);
    throw err;
  }
});

ipcMain.handle('save-image-dialog', async (event, dataUrl, defaultName) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const result = await dialog.showSaveDialog(win, {
    title: 'Save QR Code',
    defaultPath: defaultName,
    filters: [{ name: 'PNG Images', extensions: ['png'] }]
  });
  if (result.canceled || !result.filePath) return false;

  try {
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(result.filePath, base64Data, 'base64');
    return true;
  } catch (err) {
    console.error('Failed to save image file:', err);
    throw err;
  }
});

// Unified Study Navigation IPC
ipcMain.on('navigate-to-study', (event, studyInstanceUID) => {
  if (mainWindow) {
    mainWindow.webContents.send('open-study', studyInstanceUID);
  }
});

ipcMain.handle('get-startup-study', () => {
  const uid = startupStudyUid;
  startupStudyUid = null; // One-shot: clear after consumption so subsequent navigations don't reload it
  return uid;
});

ipcMain.handle('get-startup-share', () => {
  const token = startupShareToken;
  startupShareToken = null; // One-shot: clear after consumption
  return token;
});

// Services Health and Lifecycle IPC
ipcMain.handle('get-services-status', async () => {
  return await serviceManager.getStatus();
});

ipcMain.handle('retry-services', async () => {
  await serviceManager.startServices();
  return await serviceManager.getStatus();
});

ipcMain.on('open-logs-folder', () => {
  serviceManager.openLogs();
});

ipcMain.on('window-reload', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win) win.webContents.reload();
});

ipcMain.on('window-toggle-devtools', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win) win.webContents.toggleDevTools();
});

