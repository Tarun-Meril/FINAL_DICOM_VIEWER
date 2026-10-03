import path from 'path';
import fs from 'fs';
import http from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { app, shell } from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function copyDirRecursiveSync(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  const entries = fs.readdirSync(source, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursiveSync(srcPath, destPath);
    } else {
      if (!fs.existsSync(destPath)) {
        try {
          fs.copyFileSync(srcPath, destPath);
        } catch (_) {}
      }
    }
  }
}

export class ServiceManager {
  constructor(baseDir) {
    this.baseDir = baseDir || __dirname;
    this.pacsProcess = null;
    this.backendProcess = null;
    this.isShuttingDown = false;

    // Cross-platform persistent clinical data directory structure
    let programDataRoot;
    if (process.platform === 'win32') {
      const baseProgramData = process.env.ProgramData || app.getPath('appData');
      const legacyPath = path.join(baseProgramData, 'MedView PRO');
      const newPath = path.join(baseProgramData, 'MerilView');
      programDataRoot = newPath;
      if (fs.existsSync(legacyPath) && !fs.existsSync(newPath)) {
        try {
          fs.renameSync(legacyPath, newPath);
          console.log(`[ServiceManager] Migrated Windows clinical data from '${legacyPath}' to '${newPath}'`);
        } catch {
          programDataRoot = legacyPath;
        }
      }
    } else if (process.platform === 'darwin') {
      // macOS: ~/Library/Application Support/MerilView
      const appSupport = app.getPath('appData');
      const legacyPath = path.join(appSupport, 'MedView PRO');
      const newPath = path.join(appSupport, 'MerilView');
      programDataRoot = newPath;
      if (fs.existsSync(legacyPath) && !fs.existsSync(newPath)) {
        try {
          fs.renameSync(legacyPath, newPath);
          console.log(`[ServiceManager] Migrated macOS clinical data from '${legacyPath}' to '${newPath}'`);
        } catch {
          programDataRoot = legacyPath;
        }
      }
    } else {
      // Linux / Ubuntu: ~/.local/share/MerilView or ~/.config/MerilView
      const xdgData = process.env.XDG_DATA_HOME || path.join(app.getPath('home'), '.local', 'share');
      const legacyPath = path.join(xdgData, 'MedView PRO');
      const newPath = path.join(xdgData, 'MerilView');
      programDataRoot = newPath;
      if (fs.existsSync(legacyPath) && !fs.existsSync(newPath)) {
        try {
          fs.renameSync(legacyPath, newPath);
          console.log(`[ServiceManager] Migrated Linux clinical data from '${legacyPath}' to '${newPath}'`);
        } catch {
          programDataRoot = legacyPath;
        }
      }
    }

    this.paths = {
      root: programDataRoot,
      config: path.join(programDataRoot, 'config'),
      database: path.join(programDataRoot, 'database'),
      dicom: path.join(programDataRoot, 'dicom'),
      studies: path.join(programDataRoot, 'studies'),
      exports: path.join(programDataRoot, 'exports'),
      logs: path.join(programDataRoot, 'logs'),
      cache: path.join(programDataRoot, 'cache'),
      temp: path.join(programDataRoot, 'temp'),
      backups: path.join(programDataRoot, 'backups'),
      dbFile: path.join(programDataRoot, 'database', 'db.json'),
      pacsLog: path.join(programDataRoot, 'logs', 'pacs_backend.log'),
      viewerLog: path.join(programDataRoot, 'logs', 'viewer_backend.log'),
    };

    this.initDirectories();
  }

  initDirectories() {
    try {
      Object.values(this.paths).forEach((dirPath) => {
        if (!dirPath.endsWith('.json') && !dirPath.endsWith('.log')) {
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }
        }
      });

      // Seed initial db.json if not present
      if (!fs.existsSync(this.paths.dbFile)) {
        const candidates = [
          process.resourcesPath ? path.join(process.resourcesPath, 'pacs-backend', 'data', 'db.json') : null,
          path.resolve(this.baseDir, '../../../pacs-study-browser/backend/data/db.json'),
          path.resolve(this.baseDir, '../../pacs-study-browser/backend/data/db.json'),
          path.resolve(this.baseDir, '../pacs-study-browser/backend/data/db.json'),
          path.resolve(__dirname, '../../../pacs-study-browser/backend/data/db.json')
        ].filter(Boolean);

        let seedContent = null;
        for (const cand of candidates) {
          if (fs.existsSync(cand)) {
            seedContent = fs.readFileSync(cand, 'utf8');
            console.log(`[ServiceManager] Seeded db.json from ${cand}`);
            break;
          }
        }

        if (seedContent) {
          fs.writeFileSync(this.paths.dbFile, seedContent, 'utf8');
        } else {
          // Fallback minimal structure
          fs.writeFileSync(this.paths.dbFile, JSON.stringify({ studies: [], series: [], instances: [] }, null, 2), 'utf8');
        }
      }

      // Seed initial sample DICOM instances if dicom folder is empty
      if (fs.existsSync(this.paths.dicom)) {
        let existingFiles = [];
        try {
          existingFiles = fs.readdirSync(this.paths.dicom);
        } catch (_) {}

        if (existingFiles.length === 0) {
          const sampleSourceDirs = [
            process.resourcesPath ? path.join(process.resourcesPath, 'pacs-backend', 'data', 'instances') : null,
            path.resolve(this.baseDir, '../../../pacs-study-browser/backend/data/instances'),
            path.resolve(this.baseDir, '../../pacs-study-browser/backend/data/instances'),
            path.resolve(this.baseDir, '../pacs-study-browser/backend/data/instances'),
          ].filter(Boolean);

          for (const srcDir of sampleSourceDirs) {
            if (fs.existsSync(srcDir) && fs.readdirSync(srcDir).length > 0) {
              console.log(`[ServiceManager] Seeding initial sample DICOM instances from ${srcDir}...`);
              copyDirRecursiveSync(srcDir, this.paths.dicom);
              break;
            }
          }
        }
      }
    } catch (err) {
      console.error('[ServiceManager] Directory initialization warning:', err);
    }
  }

  async checkHealth(url, timeoutMs = 2500) {
    return new Promise((resolve) => {
      let resolved = false;
      try {
        const u = new URL(url);
        const req = http.get({
          hostname: u.hostname,
          port: u.port,
          path: u.pathname,
          timeout: timeoutMs,
        }, (res) => {
          res.resume();
          if (!resolved) {
            resolved = true;
            resolve(res.statusCode >= 200 && res.statusCode < 400);
          }
        });

        req.on('timeout', () => {
          req.destroy();
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
        });

        req.on('error', () => {
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
        });
      } catch {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      }
    });
  }

  async startServices() {
    console.log('[ServiceManager] Checking health of local services...');
    
    // 1. Check PACS Backend (Port 3001)
    let pacsHealthy = await this.checkHealth('http://127.0.0.1:3001/api/health', 1500);
    if (!pacsHealthy) {
      console.log('[ServiceManager] Port 3001 not responding. Spawning PACS Study Browser backend service...');
      this.spawnPacsBackend();
      // Wait up to 3 seconds for port 3001 to become ready
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 500));
        pacsHealthy = await this.checkHealth('http://127.0.0.1:3001/api/health', 1000);
        if (pacsHealthy) {
          console.log('[ServiceManager] PACS Study Browser backend is now online on port 3001.');
          break;
        }
      }
    } else {
      console.log('[ServiceManager] PACS Study Browser backend is already running on port 3001.');
    }

    // 2. Check Viewer FastAPI Backend (Port 8000)
    let viewerHealthy = await this.checkHealth('http://127.0.0.1:8000/api/health', 1500);
    if (!viewerHealthy) {
      console.log('[ServiceManager] Port 8000 not responding. Checking for local Python FastAPI backend...');
      this.spawnViewerBackend();
      for (let i = 0; i < 14; i++) {
        await new Promise(r => setTimeout(r, 500));
        viewerHealthy = await this.checkHealth('http://127.0.0.1:8000/api/health', 1000);
        if (viewerHealthy) {
          console.log('[ServiceManager] DICOM Viewer backend is now online on port 8000.');
          break;
        }
      }
    } else {
      console.log('[ServiceManager] DICOM Viewer backend is already running on port 8000.');
    }
  }

  spawnPacsBackend() {
    try {
      const candidates = [
        process.resourcesPath ? path.join(process.resourcesPath, 'pacs-backend', 'dist', 'server.js') : null,
        path.resolve(this.baseDir, '../../../pacs-study-browser/backend/dist/server.js'),
        path.resolve(this.baseDir, '../../pacs-study-browser/backend/dist/server.js'),
        path.resolve(this.baseDir, '../../../pacs-study-browser/backend/src/server.ts'),
      ].filter(Boolean);

      const scriptPath = candidates.find(p => fs.existsSync(p));
      
      let backendDir = path.resolve(this.baseDir, '../../../pacs-study-browser/backend');
      if (app.isPackaged || !fs.existsSync(backendDir)) {
        const packagedBackend = process.resourcesPath ? path.join(process.resourcesPath, 'pacs-backend') : null;
        if (packagedBackend && fs.existsSync(packagedBackend)) {
          backendDir = packagedBackend;
        }
      }

      console.log(`[ServiceManager] Launching PACS Backend: script=${scriptPath}, cwd=${backendDir}`);

      const env = {
        ...process.env,
        PORT: '3001',
        HOST: '127.0.0.1',
        DB_PATH: this.paths.dbFile,
        STORAGE_DIR: this.paths.dicom,
        LOG_DIR: this.paths.logs,
        TEMP_DIR: this.paths.temp,
        BACKUP_DIR: this.paths.backups,
      };

      const logStream = fs.createWriteStream(this.paths.pacsLog, { flags: 'a' });

      if (scriptPath && scriptPath.endsWith('.js')) {
        this.pacsProcess = spawn(process.execPath, [scriptPath], {
          cwd: backendDir,
          env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
          stdio: ['ignore', 'pipe', 'pipe']
        });
      } else {
        // Dev fallback: use npm run dev
        this.pacsProcess = spawn('npm', ['run', 'dev'], {
          cwd: backendDir,
          env,
          shell: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });
      }

      if (this.pacsProcess) {
        this.pacsProcess.stdout.pipe(logStream);
        this.pacsProcess.stderr.pipe(logStream);

        this.pacsProcess.on('exit', (code, signal) => {
          if (!this.isShuttingDown) {
            console.warn(`[ServiceManager] PACS Backend exited unexpectedly with code ${code}, signal ${signal}`);
          }
        });
      }
    } catch (err) {
      console.error('[ServiceManager] Failed to spawn PACS Backend:', err);
    }
  }

  spawnViewerBackend() {
    try {
      const candidates = [
        process.resourcesPath ? path.join(process.resourcesPath, 'backend') : null,
        path.resolve(this.baseDir, '../../backend'),
        path.resolve(this.baseDir, '../../../dicom ui viewer/backend'),
        path.resolve(this.baseDir, '../../../../dicom ui viewer/backend'),
        'G:\\newww\\Meril_Dicom_Viewer\\dicom ui viewer\\backend',
      ].filter(Boolean);
      const backendDir = candidates.find(p => fs.existsSync(p));
      if (!backendDir) {
        console.warn('[ServiceManager] Viewer FastAPI backend directory not found in candidates:', candidates);
        return;
      }

      const logStream = fs.createWriteStream(this.paths.viewerLog, { flags: 'a' });

      // Use populated instances directory (check ProgramData first, then fallback to repo data)
      let instancesDir = this.paths.dicom;
      const candidateDirs = [
        this.paths.dicom,
        path.resolve(this.baseDir, '../../backend/pacs_data'),
        path.resolve(this.baseDir, '../../../pacs-study-browser/backend/data/instances'),
        path.resolve(this.baseDir, '../../pacs-study-browser/backend/data/instances'),
      ];
      for (const cand of candidateDirs) {
        try {
          if (fs.existsSync(cand) && fs.readdirSync(cand).length > 0) {
            instancesDir = cand;
            break;
          }
        } catch {}
      }

      const env = {
        ...process.env,
        DATABASE_URL: `sqlite:///${path.join(this.paths.database, 'merilview.db').replace(/\\/g, '/')}`,
        PACS_BROWSER_URL: 'http://127.0.0.1:3001',
        PACS_INSTANCES_DIR: instancesDir,
        DB_PATH: this.paths.dbFile,
      };

      const pythonCandidates = [
        process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe') : null,
        process.platform === 'win32' ? 'C:\\Users\\Tarun\\AppData\\Local\\Programs\\Python\\Python313\\python.exe' : null,
        process.platform === 'win32' ? 'python.exe' : 'python3',
        'python',
        'python3',
        'py'
      ].filter(Boolean);

      let pythonCmd = pythonCandidates.find(p => {
        try { return fs.existsSync(p); } catch { return false; }
      }) || (process.platform === 'win32' ? 'python' : 'python3');

      console.log(`[ServiceManager] Launching Viewer FastAPI Backend: python=${pythonCmd}, cwd=${backendDir}`);

      this.backendProcess = spawn(pythonCmd, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], {
        cwd: backendDir,
        env,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      if (this.backendProcess) {
        this.backendProcess.stdout.pipe(logStream);
        this.backendProcess.stderr.pipe(logStream);

        this.backendProcess.on('exit', (code, signal) => {
          if (!this.isShuttingDown) {
            console.warn(`[ServiceManager] Viewer Backend exited with code ${code}, signal ${signal}`);
          }
        });
      }
    } catch (err) {
      console.log('[ServiceManager] Optional Python FastAPI backend not loaded:', err.message);
    }
  }

  async getStatus() {
    let pacs = await this.checkHealth('http://127.0.0.1:3001/api/health', 2500);
    if (!pacs) {
      await new Promise(r => setTimeout(r, 600));
      pacs = await this.checkHealth('http://127.0.0.1:3001/api/health', 2500);
    }

    let backend = await this.checkHealth('http://127.0.0.1:8000/api/health', 2500);
    if (!backend) {
      await new Promise(r => setTimeout(r, 600));
      backend = await this.checkHealth('http://127.0.0.1:8000/api/health', 2500);
    }

    let error = null;
    if (!pacs) {
      error = 'The PACS Archive Service on port 3001 is not responding. Check application logs for details.';
    }

    return {
      pacs,
      backend: backend || pacs,
      pythonBackend: backend,
      programDataDir: this.paths.root,
      error
    };
  }

  openLogs() {
    try {
      shell.openPath(this.paths.logs);
    } catch (err) {
      console.error('[ServiceManager] Could not open logs folder:', err);
    }
  }

  shutdown() {
    this.isShuttingDown = true;
    console.log('[ServiceManager] Shutting down child backend services safely...');

    if (this.pacsProcess && this.pacsProcess.pid) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(this.pacsProcess.pid), '/f', '/t']);
        } else {
          this.pacsProcess.kill('SIGTERM');
        }
      } catch (err) {
        console.warn('[ServiceManager] Note on terminating PACS process:', err);
      }
      this.pacsProcess = null;
    }

    if (this.backendProcess && this.backendProcess.pid) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(this.backendProcess.pid), '/f', '/t']);
        } else {
          this.backendProcess.kill('SIGTERM');
        }
      } catch (err) {
        console.warn('[ServiceManager] Note on terminating Viewer Backend process:', err);
      }
      this.backendProcess = null;
    }
  }
}
