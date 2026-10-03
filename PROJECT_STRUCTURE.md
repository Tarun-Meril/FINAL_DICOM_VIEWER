# MerilView DICOM Workstation - Project Structure

This document provides a comprehensive map of the directory structure across the MerilView DICOM Workstation repository.

---

## 1. High-Level Workspace Tree

```
MAIN-DICOM-main/
├── dicom ui viewer/                      # CORE DIAGNOSTIC WORKSTATION
│   ├── backend/                          # FastAPI Python Gateway Service
│   │   ├── app/                          # Application source modules
│   │   │   ├── api/                      # REST endpoints (auth, studies, measurements, mpr, ai, export)
│   │   │   ├── auth/                     # JWT authentication & session management
│   │   │   ├── config/                   # Pydantic global settings (.env)
│   │   │   ├── database/                 # SQLAlchemy engine, session maker, connection logic
│   │   │   ├── dicom/                    # DICOMweb client proxy (QIDO, WADO, STOW)
│   │   │   ├── models/                   # SQLAlchemy ORM models (studies, annotations, users)
│   │   │   ├── schemas/                  # Pydantic request/response schemas
│   │   │   ├── services/                 # Business logic (measurements, storage, notifications)
│   │   │   ├── streaming/                # Pydicom frame extraction & streaming
│   │   │   ├── main.py                   # FastAPI application initialization & WebSocket hub
│   │   │   └── worker.py                 # Celery task definitions & task queues
│   │   ├── migrations/                   # Alembic database schema migrations
│   │   ├── alembic.ini                   # Alembic configuration
│   │   ├── check_db.py / create_db.py    # Database connection & table bootstrapping utilities
│   │   ├── Dockerfile                    # Container definition (Python 3.12-slim)
│   │   ├── requirements.txt              # Backend dependencies
│   │   └── start.sh                      # Container startup script (migrations, workers, uvicorn)
│   │
│   ├── frontend/                         # React 19 + CornerstoneJS + Vite + Electron
│   │   ├── electron/                     # Electron desktop shell wrapper
│   │   │   ├── main.js                   # Main process, window manager, native menus
│   │   │   └── preload.cjs               # ContextBridge secure IPC bridge
│   │   ├── src/                          # Frontend source code
│   │   │   ├── 3d/                       # 3D volume rendering engine & transfer functions
│   │   │   ├── clinical/                 # Clinical tools (Cobb angle, CTR, RECIST, spine)
│   │   │   ├── components/               # UI components (Viewport, Sidebars, Toolbar, Dialogs)
│   │   │   ├── mpr/                      # Multi-Planar Reconstruction viewport manager
│   │   │   ├── vr/                       # Virtual Reality / Volume Rendering integration
│   │   │   ├── App.tsx                   # Main workstation application router
│   │   │   ├── initCornerstone.ts        # CornerstoneJS 4.x initialization & WASM decoders
│   │   │   └── main.tsx                  # React DOM entry point
│   │   ├── copy-vr-wasm.mjs              # WebAssembly assets sync script
│   │   ├── Dockerfile                    # Production Nginx multi-stage container
│   │   ├── nginx.conf                    # Nginx config (SPA routing, COOP/COEP isolation)
│   │   ├── package.json                  # Dependencies & execution scripts
│   │   └── vite.config.ts                # Vite config (COOP/COEP, WASM, plugins)
│   │
│   ├── docker-compose.yml                # Integrated workstation services compose
│   ├── docker-compose.dev.yml            # Local development compose (hot-reload & Orthanc)
│   └── docker-compose.prod.yml           # Production deployment compose profile
│
├── pacs-study-browser/                  # STANDALONE PACS SYSTEM
│   ├── backend/                          # Express.js API & Metadata Store
│   │   ├── src/                          # TypeScript modules (routes, controllers, config)
│   │   ├── data/                         # Local JSON database (db.json) & .dcm file store
│   │   └── package.json                  # Express backend dependencies
│   │
│   ├── frontend/                         # PACS Study Search & Upload Portal
│   │   ├── src/                          # React components, filters, study tables
│   │   ├── package.json                  # PACS frontend dependencies
│   │   └── vite.config.ts                # Vite configuration (port 3005, proxy to 3001)
│   │
│   └── package.json                      # Workspace scripts (install:all, dev, build:all)
│
├── medview-vr/                          # 3D GPU VOLUME RENDERING ENGINE
│   ├── src/                              # Ray-cast volume rendering, transfer functions
│   ├── docs/                             # Clinical safety, architecture, validation reports
│   ├── tools/                            # Conformance checks & test helpers
│   ├── package.json                      # VTK.js & rendering dependencies
│   └── vite.config.ts                    # Vite config (port 5173, WebGL 2 headers)
│
├── mpr building/                        # STANDALONE 2D MPR ENGINE
│   └── mpr building/                     # Multi-Planar Reconstruction implementation
│       ├── src/                          # Synchronized axial/coronal/sagittal viewports
│       ├── tools/                        # Synthetic validation phantoms (e2e-smoke, make-phantom)
│       ├── package.json                  # Cornerstone3D dependencies
│       └── vite.config.ts                # Cross-Origin Isolated server (port 5176)
│
├── docker-compose.yml                    # Root Docker Compose for one-command stack startup
├── package.json                          # Root npm orchestration scripts (dev:all, dev:viewer, etc.)
├── COMMANDS.md                           # Master CLI & operations manual
├── ARCHITECTURE.md                       # Comprehensive system architecture & data flow
├── TECH_STACK.md                         # Frameworks, versions, and imaging components
├── DEPENDENCIES.md                       # Complete package dependencies catalog
├── AUDIT_REPORT.md                       # System audit, security, and performance report
└── README.md                             # Top-level repository overview
```

---

## 2. Subsystem Descriptions

### A. MerilView Diagnostic Viewer (`dicom ui viewer/frontend`)
* **`src/components/Viewport.tsx`**: High-performance medical image canvas handling pan, zoom, window/level (WW/WL), rotation, invert, pseudo-color LUTs, and interactive drawing tools.
* **`src/initCornerstone.ts`**: Configures the CornerstoneJS 4.x core image loader with client-side WebAssembly codecs:
  * `libjpeg-turbo` for baseline 8-bit DICOM JPEGs.
  * `CharLS` for lossless and near-lossless JPEG-LS.
  * `OpenJPEG` for 12/16-bit JPEG 2000.
* **`src/clinical/`**: Implements specialized medical calculators and measurement tools:
  * Cardiothoracic Ratio (CTR)
  * Spinal Cobb Angle measurement
  * RECIST 1.1 tumor tracking
  * Vertebral body labeling & orthopedic line gauges
* **`src/mpr/`**: Integrates 2D Multi-Planar Reconstruction directly within the main workstation view.
* **`electron/`**: Wraps the web application in a native Windows desktop shell with borderless frame controls and local file system access.

### B. MerilView Backend API (`dicom ui viewer/backend`)
* **`app/main.py`**: ASGI application initialization, CORS configuration, `/health` diagnostics endpoint, and bidirectional WebSocket synchronization hubs.
* **`app/api/`**: Comprehensive REST router suite covering authentication, studies, series, instances, metadata, viewport state, layouts, annotations, hanging protocols, and AI inferences.
* **`app/worker.py`**: Celery asynchronous background worker handling offloaded tasks:
  * `thumbnail_queue`: Generation of study and series preview thumbnails.
  * `upload_queue`: Processing of uploaded multi-part DICOM archives.
  * `export_queue`: Packaging and ZIP generation of selected DICOM studies.
  * `ai_queue`: Asynchronous inference and lesion detection jobs.

### C. PACS Study Browser (`pacs-study-browser`)
* Decoupled administrative study browser simulating a hospital PACS network.
* Supports filtering by Patient Name, ID, Accession Number, Modality, and Date.
* Offers drag-and-drop DICOM import and generates deep links that seamlessly launch the MerilView viewer.

### D. MerilView VR Engine (`medview-vr`)
* Pure 3D volume visualization prototype utilizing VTK.js GPU ray casting.
* Directly reads local DICOM series without requiring server-side reformatting.
* Features customizable transfer function presets, multi-planar clipping slabs, and 3D segmentation sculpting.

### E. Standalone MPR Engine (`mpr building`)
* Dedicated 2D Multi-Planar Reconstruction workspace.
* Uses Cornerstone3D with Cross-Origin Isolation (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`) to enable zero-copy `SharedArrayBuffer` memory allocation across Web Workers.
