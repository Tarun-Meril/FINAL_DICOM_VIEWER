# MerilView DICOM Workstation - Project Commands Manual

This document provides a comprehensive operational guide, package scripts, build targets, database migrations, and Docker containerization commands for all workstation components.

---

## 0. Quick Architecture & Port Reference

| Component | Default Port | Technology | Primary Function | Working Directory |
| :--- | :--- | :--- | :--- | :--- |
| **MerilView Frontend** | `5174` | React 19, Vite, CornerstoneJS | Diagnostic 2D/3D DICOM Viewer | `dicom ui viewer/frontend` |
| **MerilView Backend** | `8000` | FastAPI, Python 3.12, Uvicorn | REST API, WebSockets, Storage, AI | `dicom ui viewer/backend` |
| **PACS Study Browser (Web)** | `3005` | React, Vite, Tailwind | Study listing, search & viewer launcher | `pacs-study-browser/frontend` |
| **PACS Study Browser (API)** | `3001` | Express, Node.js, Supabase | DICOM study indexing & sharing API | `pacs-study-browser/backend` |
| **MerilView VR Engine** | `5173` | Three.js / WebGL / VTK.js | 3D Volume Rendering engine | `medview-vr` |
| **Standalone MPR Viewer** | `5176` | Cornerstone3D, Vite (COOP/COEP) | 2D Multi-Planar Reconstruction | `mpr building/mpr building` |
| **Orthanc PACS Server** | `8042` / `4242` | Orthanc C++ / Plugins | DICOMweb & C-STORE DICOM archive | Docker (`pacs-orthanc`) |
| **PostgreSQL Database** | `5432` | PostgreSQL 16 | Annotations, sessions, hanging protocols | Docker (`db-postgres`) |
| **Redis Cache / Broker** | `6379` | Redis 7 | Viewport caching, Celery task queue | Docker (`cache-redis`) |
| **Nginx Production Client** | `3000` / `80` | Nginx Alpine | Production static SPA with COOP/COEP | Docker (`web-frontend`) |
| **Unified Desktop Application** | Desktop App | Electron 34, React 19, Express, SQLite | Single `.exe` desktop workstation combining PACS & Viewer | `dicom ui viewer/frontend` |

---

## 1. Unified Desktop Application & Orchestration Commands

### A. Desktop Workstation Build & Packaging (Single `.exe` Installer)

Run from the repository root:

```powershell
# Build production bundle and package single Windows installer: "MerilView Setup.exe"
npm run build:desktop
```

* **Installer Output**: `dicom ui viewer/frontend/release/MerilView Setup.exe`
* **Portable / Unpacked Output**: `dicom ui viewer/frontend/release/win-unpacked/MerilView.exe`
* **Persistent Clinical Storage**: `%ProgramData%\MerilView` (retained across app updates and uninstalls)
  * `database/db.json` (DICOM study catalog)
  * `dicom/` (persistent DICOM storage & imported instances)
  * `logs/` (`pacs_backend.log`, `viewer_backend.log`)
  * `exports/`, `config/`, `cache/`

### B. Desktop Workstation Development

```powershell
# Launch unified MerilView in Electron desktop development mode (with hot-reload)
npm run dev:electron
```

### C. Web / Microservices Local Development

```powershell
# Run PACS Study Browser and MerilView Viewer concurrently in browser
npm run dev

# Alternative alias for running PACS and Viewer together
npm run dev:all

# Run PACS Study Browser only (starts Express 3001 & React 3005)
npm run dev:pacs

# Run MerilView Frontend Viewer only (port 5174)
npm run dev:viewer

# Run MerilView VR 3D Volume Rendering engine (port 5173)
npm run dev:vr

# Run Standalone 2D MPR Reconstruction engine (port 5176)
npm run dev:mpr
```

---

## 2. Docker & Container Orchestration

### A. Root Docker Compose (Full Workstation Stack)

Run directly from the repository root:

```powershell
# Launch all infrastructure and services in detached mode
docker compose up -d

# Force rebuild of container images before startup
docker compose up --build -d

# View real-time logs across all services
docker compose logs -f

# View logs for a specific service (e.g. backend or frontend)
docker compose logs -f api-backend
docker compose logs -f web-frontend

# Stop all running containers
docker compose down

# Stop containers and remove persistent volume data (fresh database start)
docker compose down -v
```

### B. Specialized Compose Profiles (`dicom ui viewer`)

You can also run compose directly from `dicom ui viewer`:

```powershell
cd "dicom ui viewer"

# 1. Development profile (with volume mounting, hot-reload, and Orthanc)
docker compose -f docker-compose.dev.yml up -d

# 2. Production profile (optimized builds, production Nginx with COOP/COEP headers)
docker compose -f docker-compose.prod.yml up -d

# 3. Hybrid Development (Only run PostgreSQL, Redis, and Orthanc in Docker; run apps locally)
docker compose up -d db-postgres cache-redis pacs-orthanc
```

### C. Standalone Docker Builds

```powershell
# Build MerilView Backend Image
docker build -t medview-backend:latest "dicom ui viewer/backend"

# Build MerilView Frontend Image (includes Nginx + Cross-Origin Isolation)
docker build -t medview-frontend:latest "dicom ui viewer/frontend"
```

---

## 3. MerilView API Service (Backend)

Working directory: `dicom ui viewer/backend`

### Virtual Environment Setup & Dependencies

```powershell
cd "dicom ui viewer/backend"

# Create Python virtual environment
python -m venv venv

# Activate virtual environment in PowerShell
.\venv\Scripts\Activate.ps1

# Install requirements
pip install -r requirements.txt
```

### Server Startup

```powershell
# Run FastAPI server with auto-reload bound to port 8000
uvicorn app.main:app --reload --port 8000

# Run on all network interfaces
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Database Migrations (Alembic)

```powershell
# Apply all pending migrations to the database
alembic upgrade head

# Roll back the most recent migration step
alembic downgrade -1

# Generate a new migration script based on model definitions
alembic revision --autogenerate -m "add_new_feature_table"
```

### Database Utilities

```powershell
# Check database connection and table integrity
python check_db.py

# Initialize database schema tables directly
python create_db.py
```

### Celery Background Workers & Task Schedulers

```powershell
# Run Celery worker listening to all operational queues
celery -A app.worker worker --loglevel=info -Q default,thumbnail_queue,ai_queue,upload_queue,export_queue

# Run Celery Beat scheduler for periodic tasks and cleanup
celery -A app.worker beat --loglevel=info
```

---

## 4. MerilView DICOM Viewer (Frontend)

Working directory: `dicom ui viewer/frontend`

### Installation & WASM Sync

```powershell
cd "dicom ui viewer/frontend"

# Install npm dependencies
npm install

# Copy VR WebAssembly binaries into public folder
npm run prepare:wasm
```

### Development Server

```powershell
# Launch Vite development server on port 5174
npm run dev

# Run Vite renderer without pre-build hooks
npm run dev:renderer

# Run with Electron desktop application window wrapper
npm run dev:electron
```

### Production Compilation & Desktop Packaging

```powershell
# Compile TypeScript and bundle production assets to /dist
npm run build

# Preview compiled production build locally
npm run preview

# Package as Windows Desktop Installer (.exe via Electron Builder)
npm run build:desktop
```

---

## 5. PACS Study Browser

Working directory: `pacs-study-browser`

### Setup & Development

```powershell
cd "pacs-study-browser"

# Install dependencies across root, backend, and frontend
npm run install:all

# Run Express backend (port 3001) and React frontend (port 3005) concurrently
npm run dev

# Run Express backend individually
npm run dev:backend

# Run React frontend individually
npm run dev:frontend

# Build frontend and backend for production
npm run build:all
```

---

## 6. MerilView VR Engine (3D Volume Rendering)

Working directory: `medview-vr`

```powershell
cd "medview-vr"

# Install dependencies
npm install

# Run 3D volume rendering server on port 5173
npm run dev

# Run Playwright end-to-end tests
npx playwright test
```

---

## 7. Standalone MPR Engine (2D Multi-Planar Reconstruction)

Working directory: `mpr building/mpr building`

```powershell
cd "mpr building/mpr building"

# Install dependencies
npm install

# Run standalone MPR viewer on port 5176 (with COOP/COEP isolated headers)
npm run dev

# Run unit tests
npm run test
```

---

## 8. Diagnostics, Health Checks & Troubleshooting

### System Health Checks

- **Backend Health Endpoint**: `http://localhost:8000/health` or `http://localhost:8000/api/health`
- **Swagger Interactive API Docs**: `http://localhost:8000/docs`
- **Orthanc DICOMweb Status**: `http://localhost:8042/system` (User: `orthanc`, Pass: `orthanc`)

### Kill Stuck Processes on Busy Ports (PowerShell)

If any dev server fails with `EADDRINUSE` or `Port already in use`:

```powershell
# Find and terminate process on a specific port (e.g. 8000, 5174, 3001, 3005, 5176)
$port = 8000
Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# Kill all standard workstation ports in one command:
@(8000, 5174, 5173, 5176, 3001, 3005, 8042) | ForEach-Object {
    Get-NetTCPConnection -LocalPort $_ -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force
    }
}
```

### Cross-Origin Isolation Verification (WASM / SharedArrayBuffer)

Cornerstone3D and MPR require Cross-Origin Isolation. You can verify it in the browser console:

```javascript
console.log("Cross-Origin Isolated:", window.crossOriginIsolated);
// Expected output: true
```

If `false`, verify that the serving web server sends:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`
