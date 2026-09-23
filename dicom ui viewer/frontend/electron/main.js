import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeImage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewerConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../viewer.config.json'), 'utf8'));
const viewerDevUrl = viewerConfig.baseUrl;

// Enable GPU and WebGL hardware acceleration required by Cornerstone3D and VTK.js MPR/VR rendering
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');
// Allow up to 32 simultaneous active WebGL contexts so multi-viewport MPR & 2D rendering never trigger context loss
app.commandLine.appendSwitch('max-active-webgl-contexts', '32');
// Prevent GPU shader cache disk creation errors on Windows without disabling GPU
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('no-sandbox');

// Protocol Scheme Client for deep linking
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('medview', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('medview');
}

let mainWindow = null;
let startupDeepLinkUrl = null;

// Parse initial arguments on startup (Windows deep linking)
const deepLinkUrl = process.argv.find(arg => arg.startsWith('medview://'));
if (deepLinkUrl) {
  startupDeepLinkUrl = deepLinkUrl;
}

// Single Instance Lock — only enforce in production to avoid dev restart issues
const gotTheLock = app.isPackaged ? app.requestSingleInstanceLock() : true;
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      const url = commandLine.find(arg => arg.startsWith('medview://'));
      if (url) {
        handleDeepLink(url);
      }
    }
  });
}

function handleDeepLink(url) {
  if (!mainWindow) return;
  if (url && url.startsWith('medview://')) {
    const route = url.substring('medview://'.length);
    const parts = route.split('/');
    if (parts[0] === 'share' && parts[1]) {
      const token = parts[1];
      mainWindow.webContents.send('open-shared-study', token);
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false, // frameless window
    backgroundColor: '#1E1E1E',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Must be false so ipcRenderer.send() works via contextBridge preload
    },
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (startupDeepLinkUrl) {
      handleDeepLink(startupDeepLinkUrl);
      startupDeepLinkUrl = null;
    }
  });

  // Load URL
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    // In development, load Vite local server
    mainWindow.loadURL(viewerDevUrl).catch(() => {
      // If dev server hasn't started yet, try again in 1 second
      setTimeout(() => {
        mainWindow.loadURL(viewerDevUrl);
      }, 1000);
    });
    // Open DevTools if desired in dev
    // mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built html file
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
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

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
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
        if (files.length >= 500) break;
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
