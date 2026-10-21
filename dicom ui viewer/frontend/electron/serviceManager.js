import path from 'path';
import fs from 'fs';
import http from 'http';
import { spawn, execSync } from 'child_process';
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
        } catch (_) { }
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
    this.startupPromise = null;

    // Cross-platform persistent clinical data directory structure
    let programDataRoot;
    if (process.platform === 'win32') {
      if (fs.existsSync('D:\\MerilView_Data') || fs.existsSync('D:\\')) {
        programDataRoot = 'D:\\MerilView_Data';
      } else {
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

      // Initialize clean db.json if not present
      if (!fs.existsSync(this.paths.dbFile)) {
        fs.writeFileSync(this.paths.dbFile, JSON.stringify({
          studies: [],
          series: [],
          instances: [],
          share_links: [],
          share_audit_logs: []
        }, null, 2), 'utf8');
        console.log('[ServiceManager] Initialized clean persistent database structure.');
      }

      // Auto-heal db.json paths so they point to the active clinical dicom directory on this system
      if (fs.existsSync(this.paths.dbFile)) {
        try {
          const raw = fs.readFileSync(this.paths.dbFile, 'utf8');
          const data = JSON.parse(raw);
          let modified = false;
          if (Array.isArray(data.instances)) {
            for (const inst of data.instances) {
              if (inst && inst.sopInstanceUid) {
                if (!inst.filePath || !fs.existsSync(inst.filePath)) {
                  if (inst.studyInstanceUid && inst.seriesInstanceUid) {
                    const cand = path.join(this.paths.dicom, inst.studyInstanceUid, inst.seriesInstanceUid, `${inst.sopInstanceUid}.dcm`);
                    if (fs.existsSync(cand)) {
                      inst.filePath = cand;
                      modified = true;
                    }
                  }
                  if (!inst.filePath || !fs.existsSync(inst.filePath)) {
                    const cand2 = path.join(this.paths.dicom, `${inst.sopInstanceUid}.dcm`);
                    if (fs.existsSync(cand2)) {
                      inst.filePath = cand2;
                      modified = true;
                    }
                  }
                }
              }
            }
          }
          if (modified) {
            fs.writeFileSync(this.paths.dbFile, JSON.stringify(data, null, 2), 'utf8');
            console.log('[ServiceManager] Healed and rebased DICOM instance paths in db.json to active storage');
          }
        } catch (e) {
          console.error('[ServiceManager] Failed to heal db.json paths:', e);
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

  async freePortIfDead(port) {
    if (process.platform === 'win32') {
      try {
        const netstatOutput = execSync(`netstat -ano -p tcp | findstr :${port}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const lines = netstatOutput.split('\r\n').map(l => l.trim()).filter(l => l.includes('LISTENING'));
        for (const line of lines) {
          const parts = line.split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0' && Number(pid) !== process.pid) {
            console.log(`[ServiceManager] Terminating unresponsive zombie process ${pid} occupying port ${port}...`);
            try {
              execSync(`taskkill /pid ${pid} /f /t`, { stdio: 'ignore' });
              await new Promise(r => setTimeout(r, 400));
            } catch (_) { }
          }
        }
      } catch (_) {
        // Port is free or findstr returned no match
      }
    } else {
      // Linux / Ubuntu port freeing: try fuser or lsof
      try {
        try {
          execSync(`fuser -k ${port}/tcp`, { stdio: 'ignore' });
          await new Promise(r => setTimeout(r, 400));
        } catch (_) {
          const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
          if (pids) {
            for (const pid of pids.split('\n')) {
              const cleanPid = pid.trim();
              if (cleanPid && Number(cleanPid) !== process.pid) {
                console.log(`[ServiceManager] Terminating process ${cleanPid} occupying port ${port}...`);
                try {
                  execSync(`kill -9 ${cleanPid}`, { stdio: 'ignore' });
                } catch (_) {}
              }
            }
            await new Promise(r => setTimeout(r, 400));
          }
        }
      } catch (_) {
        // Port is free or command not found
      }
    }
  }

  startServices() {
    if (this.startupPromise) {
      return this.startupPromise;
    }

    this.startupPromise = this._startServicesInternal().finally(() => {
      this.startupPromise = null;
    });

    return this.startupPromise;
  }

  async _startServicesInternal() {
    console.log('[ServiceManager] Checking health of local services...');

    // 1. Check PACS Backend (Port 3001)
    let pacsHealthy = await this.checkHealth('http://127.0.0.1:3001/api/health', 1500);
    if (!pacsHealthy) {
      console.log('[ServiceManager] Port 3001 not responding. Spawning PACS Study Browser backend service...');
      await this.freePortIfDead(3001);
      this.spawnPacsBackend();
      // Wait up to 10 seconds (20 iterations * 500ms) for port 3001 to become ready
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        pacsHealthy = await this.checkHealth('http://127.0.0.1:3001/api/health', 1500);
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

    return { pacs: pacsHealthy, backend: viewerHealthy || pacsHealthy };
  }

  spawnPacsBackend() {
    try {
      if (this.pacsProcess && !this.pacsProcess.killed) {
        console.log(`[ServiceManager] PACS Backend process is already active (PID: ${this.pacsProcess.pid})`);
        return;
      }

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

      const nodePaths = [
        path.join(backendDir, 'node_modules'),
        path.resolve(this.baseDir, '../../../pacs-study-browser/backend/node_modules'),
        path.resolve(this.baseDir, '../../pacs-study-browser/backend/node_modules'),
      ].filter(p => fs.existsSync(p));

      const env = {
        ...process.env,
        PORT: '3001',
        HOST: process.env.SERVER_HOST || '0.0.0.0',
        DB_PATH: this.paths.dbFile,
        STORAGE_DIR: this.paths.dicom,
        LOG_DIR: this.paths.logs,
        TEMP_DIR: this.paths.temp,
        BACKUP_DIR: this.paths.backups,
        NODE_PATH: nodePaths.join(path.delimiter),
      };

      const logStream = fs.createWriteStream(this.paths.pacsLog, { flags: 'a' });

      // Determine binary to run node scripts: find explicit node binary or fallback safely
      let execCmd = 'node';
      let runAsNodeEnv = {};
      let useShell = process.platform === 'win32';

      if (process.platform === 'win32') {
        const winCandidates = [
          path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
          path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'),
          path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe'),
          path.join(process.env.APPDATA || '', 'npm', 'node.cmd')
        ];
        const found = winCandidates.find(p => {
          try { return fs.existsSync(p); } catch { return false; }
        });
        if (found) {
          execCmd = found;
          useShell = false;
        } else {
          try {
            const out = execSync('where.exe node', { stdio: 'pipe' }).toString().trim().split(/\r?\n/)[0];
            if (out && fs.existsSync(out)) {
              execCmd = out;
              useShell = false;
            }
          } catch (_) {
            useShell = true;
          }
        }
      } else {
        const unixCandidates = ['/usr/bin/node', '/usr/local/bin/node', '/bin/node', '/snap/bin/node'];
        const found = unixCandidates.find(p => {
          try { return fs.existsSync(p); } catch { return false; }
        });
        if (found) {
          execCmd = found;
          useShell = false;
        } else {
          try {
            const out = execSync('which node', { stdio: 'pipe' }).toString().trim();
            if (out && fs.existsSync(out)) {
              execCmd = out;
              useShell = false;
            }
          } catch (_) {}
        }
      }

      if (execCmd === 'node') {
        try {
          execSync('node -v', { stdio: 'ignore' });
        } catch (_) {
          execCmd = process.execPath;
          runAsNodeEnv = { ELECTRON_RUN_AS_NODE: '1' };
          useShell = false;
        }
      }

      if (scriptPath && scriptPath.endsWith('.js')) {
        let scriptArg = scriptPath;
        console.log(`[ServiceManager] Launching PACS Backend process: exec=${execCmd}, scriptArg=${scriptArg}, cwd=${backendDir}`);
        this.pacsProcess = spawn(execCmd, [scriptArg], {
          cwd: backendDir,
          env: { ...env, ...runAsNodeEnv },
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: useShell,
          windowsHide: true
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
        this.pacsProcess.on('error', (err) => {
          console.error('[ServiceManager] PACS Backend process spawn error:', err);
          if (execCmd !== process.execPath) {
            console.log('[ServiceManager] Retrying PACS Backend with embedded Electron Node runtime...');
            try {
              this.pacsProcess = spawn(process.execPath, [scriptPath], {
                cwd: backendDir,
                env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true
              });
              this.pacsProcess.on('error', (retryErr) => {
                console.error('[ServiceManager] Fallback PACS Backend also encountered error:', retryErr);
              });
              if (this.pacsProcess) {
                this.pacsProcess.stdout?.pipe(logStream);
                this.pacsProcess.stderr?.pipe(logStream);
              }
            } catch (retryCatch) {
              console.error('[ServiceManager] Immediate retry error:', retryCatch);
            }
          }
        });

        this.pacsProcess.stdout.pipe(logStream);
        this.pacsProcess.stderr.pipe(logStream);

        this.pacsProcess.on('exit', (code, signal) => {
          this.pacsProcess = null;
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
        } catch { }
      }

      const env = {
        ...process.env,
        DATABASE_URL: `sqlite:///${path.join(this.paths.database, 'merilview.db').replace(/\\/g, '/')}`,
        PACS_BROWSER_URL: 'http://127.0.0.1:3001',
        PACS_INSTANCES_DIR: instancesDir,
        DB_PATH: this.paths.dbFile,
      };

      const pythonCandidates = [
        process.env.PYTHON_PATH,
        path.join(backendDir, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python3'),
        path.join(backendDir, 'venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python3'),
        process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe') : null,
        process.platform === 'win32' ? 'python.exe' : '/usr/bin/python3',
        '/usr/local/bin/python3',
        'python3',
        'python',
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
        this.backendProcess.on('error', (err) => {
          console.warn('[ServiceManager] Viewer Backend process error:', err.message);
        });

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
    if (this.startupPromise) {
      console.log('[ServiceManager] getStatus awaiting active startupPromise...');
      try {
        await this.startupPromise;
      } catch (err) {
        console.warn('[ServiceManager] Note while awaiting startupPromise:', err);
      }
    }

    let pacs = await this.checkHealth('http://127.0.0.1:3001/api/health', 2500);
    // If not immediately healthy, gracefully poll for up to 4 seconds
    if (!pacs) {
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 500));
        pacs = await this.checkHealth('http://127.0.0.1:3001/api/health', 1500);
        if (pacs) break;
      }
    }

    let backend = await this.checkHealth('http://127.0.0.1:8000/api/health', 2000);
    if (!backend) {
      await new Promise(r => setTimeout(r, 400));
      backend = await this.checkHealth('http://127.0.0.1:8000/api/health', 1500);
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
          try {
            execSync(`pkill -P ${this.pacsProcess.pid}`, { stdio: 'ignore' });
          } catch (_) {}
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
          try {
            execSync(`pkill -P ${this.backendProcess.pid}`, { stdio: 'ignore' });
          } catch (_) {}
          this.backendProcess.kill('SIGTERM');
        }
      } catch (err) {
        console.warn('[ServiceManager] Note on terminating Viewer Backend process:', err);
      }
      this.backendProcess = null;
    }
  }
}
