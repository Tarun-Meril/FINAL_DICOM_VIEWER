# Meril Dicom Viewer (Meril_Dicom_Viewer) - Enterprise DICOM Workstation & PACS Suite

A high-performance, modular medical imaging platform combining a multi-modality diagnostic DICOM viewer, a standalone PACS study browser, a 3D GPU volume-rendering engine, a cross-origin isolated 2D Multi-Planar Reconstruction (MPR) engine, and full Orthanc DICOMweb integration.

---

## 🌟 Key Subsystems & Architecture

The workspace consists of 5 modular subsystems engineered for high diagnostic performance and clinical precision:

```
                              ┌───────────────────────────────────┐
                              │     Orthanc PACS / DICOMweb       │
                              │       (Ports 8042 / 4242)         │
                              └─────────────────┬─────────────────┘
                                                │ DICOMweb / C-STORE
    ┌──────────────────────────┐                ▼                ┌──────────────────────────┐
    │    PACS Study Browser    │ ◄─────────────────────────────► │   MedView PRO Backend    │
    │  Web: 3005 | API: 3001   │     Study Selection & Launch    │  FastAPI (Port 8000)     │
    └─────────────┬────────────┘                                 └─────────────┬────────────┘
                  │                                                            │
                  ▼                                                            ▼
    ┌──────────────────────────┐                                 ┌──────────────────────────┐
    │   MedView PRO Viewer     │                                 │   Database & Task Hub    │
    │  React 19 / Cornerstone  │                                 │ PostgreSQL: 5432         │
    │  (Port 5174 / Desktop)   │                                 │ Redis: 6379 | Celery     │
    └──────┬────────────┬──────┘                                 └──────────────────────────┘
           │            │
           ▼            ▼
┌──────────────────┐ ┌──────────────────┐
│  MedView VR 3D   │ │  Standalone MPR  │
│  VTK.js Raycast  │ │  Cornerstone3D   │
│   (Port 5173)    │ │   (Port 5176)    │
└──────────────────┘ └──────────────────┘
```

1. **[MedView PRO Diagnostic Viewer](dicom%20ui%20viewer/frontend/)** (`Port 5174`)
   - Next-generation diagnostic workstation built with React 19, Vite, and CornerstoneJS 4.x.
   - Client-side WebAssembly decoders for high-speed JPEG-LS, JPEG 2000, and HTJ2K decompression.
   - Desktop application mode packaged via Electron with custom frameless window controls.
   - Dynamic layouts, interactive measurement overlays, Cobb angles, hanging protocols, and synchronized cine playback.

2. **[MedView PRO Backend Service](dicom%20ui%20viewer/backend/)** (`Port 8000`)
   - High-throughput asynchronous FastAPI gateway.
   - Real-time WebSocket synchronization for collaborative diagnostic sessions.
   - PostgreSQL 16 persistence for user sessions, measurement state, annotations, and AI findings.
   - Celery background workers with Redis queue management for thumbnail generation, export bundling, and scheduled maintenance.

3. **[PACS Study Browser](pacs-study-browser/)** (`Frontend: Port 3005 | Backend: Port 3001`)
   - Standalone PACS registry and study management portal.
   - Multi-field filtering (Patient Name, ID, Accession Number, Modality, Date ranges).
   - Drag-and-drop DICOM ingestion with automatic header extraction (`dicom-parser`).
   - Seamless one-click deep link launch into the MedView PRO viewer.

4. **[MedView VR Engine](medview-vr/)** (`Port 5173`)
   - GPU-accelerated ray-cast 3D volume rendering built on VTK.js and WebGL 2.
   - Complete Hounsfield Unit (HU) modality LUT mapping with dataset-adaptive presets (Bone, Soft Tissue, Angio, Lung, MIP/MinIP).
   - Real-time multi-planar clipping slabs, 3D segmentation sculpting, and surface area/volume calculations.

5. **[Standalone 2D MPR Engine](mpr%20building/mpr%20building/)** (`Port 5176`)
   - True axial, coronal, and sagittal cross-referenced Multi-Planar Reconstruction.
   - Strict cross-origin isolation (`COOP` / `COEP`) enabling zero-copy `SharedArrayBuffer` streaming with Cornerstone3D.
   - Rigorous synthetic phantom generators and geometric conformance verification suites.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v20 or higher
- **Python**: v3.12 or higher
- **Docker Desktop** (Optional, for single-command full containerization)

### 2. Native Development (All Services)

Run the unified npm scripts directly from the workspace root:

```powershell
# Run PACS Study Browser (3005/3001) & MedView PRO Viewer (5174) concurrently
npm run dev

# Run individual components
npm run dev:viewer       # MedView PRO Viewer (Port 5174)
npm run dev:pacs         # PACS Study Browser (Ports 3005 / 3001)
npm run dev:vr           # MedView VR 3D Volume Engine (Port 5173)
npm run dev:mpr          # Standalone 2D MPR Engine (Port 5176)
npm run dev:electron     # Launch MedView PRO in native Electron Desktop shell
```

In a separate terminal, launch the Python backend:
```powershell
cd "dicom ui viewer/backend"
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

### 3. Docker Containerized Deployment

Launch the entire containerized infrastructure (PostgreSQL, Redis, Orthanc PACS, FastAPI Backend, Celery Workers, and Production Nginx Frontend) with one command:

```powershell
# Start all services from workspace root
docker compose up -d

# Check live logs
docker compose logs -f

# Stop and remove containers
docker compose down
```

---

## 📖 Comprehensive Documentation

| Document | Purpose |
| :--- | :--- |
| **[COMMANDS.md](COMMANDS.md)** | Master operational reference: all package commands, Docker commands, migrations, and port troubleshooting. |
| **[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)** | Complete directory tree map and explanation of modules. |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | System architecture, multi-tier data flow, and WebSocket synchronization. |
| **[TECH_STACK.md](TECH_STACK.md)** | Detailed audit of frameworks, libraries, versions, and imaging components. |
| **[DEPENDENCIES.md](DEPENDENCIES.md)** | Manifest of all production and development dependencies across packages. |
| **[AUDIT_REPORT.md](AUDIT_REPORT.md)** | Security review, clinical performance considerations, and technical debt analysis. |