# MerilView DICOM Workstation - Architecture & Data Flow

This document details the system architecture, component integrations, imaging pipelines, and real-time data flows across the MerilView DICOM Workstation.

---

## 1. System Architecture Diagram

```
                     ┌───────────────────────────────────────────────┐
                     │          Orthanc DICOM PACS Server            │
                     │  - DICOMweb REST API (Port 8042)              │
                     │  - DICOM C-STORE / DIMSE Storage (Port 4242)  │
                     └───────────────────────┬───────────────────────┘
                                             │
                       QIDO-RS / WADO-RS / STOW-RS
                                             │
                                             ▼
┌──────────────────────────────┐          ┌───────────────────────────────────────────┐
│     PACS Study Browser       │          │             MerilView Backend             │
│  - Frontend UI (Port 3005)   │ ◄──────► │  - FastAPI ASGI Framework (Port 8000)     │
│  - Express API (Port 3001)   │          │  - WebSocket Real-Time Synchronization    │
│  - Flat JSON Store & Ingest  │          │  - Pydicom Metadata & Slicing Proxy       │
└──────────────────────────────┘          └─────────┬───────────────────────┬─────────┘
                                                    │                       │
                                           PostgreSQL (5432)           Redis (6379)
                                         - User Auth & Sessions     - Viewport Cache
                                         - Annotations & ROIs       - Celery Task Broker
                                         - Measurement History              │
                                                    ┌───────────────────────┘
                                                    ▼
                                          Celery Task Workers
                                          - Thumbnail Generation (`thumbnail_queue`)
                                          - Asynchronous AI (`ai_queue`)
                                          - Study Upload/Export (`upload_queue`, `export_queue`)
                                                    │
                                                    ▼
             ┌──────────────────────────────────────────────────────────────┐
             │               MerilView Diagnostic Client (Port 5174)        │
             │                                                              │
             │   ┌──────────────────────┐        ┌──────────────────────┐   │
             │   │ React 19 Frontend UI │        │ Electron Native Host │   │
             │   │ - Glassmorphic Theme │ ◄────► │ - Frameless Window   │   │
             │   │ - Toolbar & Filmstrip│        │ - Local FS Dialogs   │   │
             │   └──────────┬───────────┘        └──────────────────────┘   │
             │              │                                               │
             │              ▼                                               │
             │   ┌──────────────────────────────────────────────────────┐   │
             │   │             CornerstoneJS 4.x Engine                 │   │
             │   │ - WADO-RS Client-Side Image Loader                   │   │
             │   │ - WebAssembly Decoders (JPEG-LS, OpenJPEG, Turbo)   │   │
             │   │ - Vector Annotation & Measurement SVG Layer          │   │
             │   │ - Hardware-Accelerated LUT & Window/Level (WW/WL)    │   │
             │   └──────────┬───────────────────────────┬───────────────┘   │
             └──────────────┼───────────────────────────┼───────────────────┘
                            │                           │
                            ▼                           ▼
             ┌─────────────────────────────┐ ┌─────────────────────────────┐
             │        MerilView 3D         │ │     Standalone 2D MPR       │
             │  - VTK.js Raycast Volume    │ │  - Cornerstone3D Reslicing  │
             │  - GPU Shaders & Transfers  │ │  - SharedArrayBuffer / COOP │
             │  - WebGL 2 (Port 5173)      │ │  - Crosshairs (Port 5176)   │
             └─────────────────────────────┘ └─────────────────────────────┘
```

---

## 2. Core Subsystems

### A. MerilView Diagnostic Viewer (`Port 5174`)
* **Primary Rendering Engine**: Implements CornerstoneJS 4.x with hardware-accelerated canvas overlays.
* **Client-Side Decoding**: Uses WebAssembly (WASM) decoders running in dedicated Web Workers:
  * `@cornerstonejs/codec-libjpeg-turbo-8bit` for baseline lossy/lossless JPEG.
  * `@cornerstonejs/codec-charls` for high-fidelity JPEG-LS compression.
  * `@cornerstonejs/codec-openjpeg` for 16-bit JPEG 2000 images.
* **Clinical Intelligence Suite**: Built-in specialized measuring tools:
  * Cardiothoracic Ratio (CTR) with four-point cardiac/thoracic calipers.
  * Spinal Cobb Angle with parallel/perpendicular reference lines.
  * RECIST 1.1 tumor tracking and longest-diameter calculation.
  * Multi-point calibration against embedded DICOM pixel spacing (`(0028,0030)`).

### B. MerilView Backend Service (`Port 8000`)
* **FastAPI Asynchronous Gateway**: Exposes comprehensive REST endpoints with automated OpenAPI / Swagger documentation (`/docs`).
* **WebSocket Collaboration Hub (`/ws/viewer` & `/ws/session`)**: Broadcasters synchronized viewport states (active slice index, pan offsets, zoom factor, window width/level) to peer clinicians in real time.
* **Celery Background Workers**: Offloads CPU-intensive operations (ZIP archive exports, thumbnail generation, and asynchronous AI inference pipelines) to Redis queues.
* **Database Layer**: SQLAlchemy ORM with automatic Alembic migrations targeting PostgreSQL 16 (with a zero-configuration SQLite fallback for local development).

### C. PACS Study Browser (`Frontend: 3005 | Backend: 3001`)
* Simulates an enterprise PACS archive, exposing REST endpoints for study discovery and metadata inspection.
* Automatically parses uploaded `.dcm` files with `dicom-parser` and records study, series, and instance metadata in a persistent store.
* Provides a 1-click deep link launch into MerilView using the pattern: `http://localhost:5174/viewer/{studyInstanceUid}`.

### D. MerilView VR Engine (`Port 5173`)
* Standalone 3D Volume Rendering engine utilizing VTK.js and WebGL 2 ray-casting shaders.
* Computes correct physical voxel grids in Patient Coordinate Space (LPS) using DICOM `ImagePositionPatient` and `ImageOrientationPatient`.
* Features customizable transfer function presets (Bone, Soft Tissue, Angiography, Lung, MIP/MinIP), 6-plane clipping slabs, and 3D sculpting tools.

### E. Standalone 2D MPR Engine (`Port 5176`)
* Production 2D Multi-Planar Reconstruction suite synchronizing axial, coronal, and sagittal orthogonal views through a 3D world-space crosshair.
* Configured with Cross-Origin Isolation headers (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`) to permit high-speed `SharedArrayBuffer` zero-copy memory transfers between Web Workers.

---

## 3. Imaging & Data Flow Workflows

### Workflow 1: Study Ingestion & Retrieval
1. DICOM studies arrive via DICOM C-STORE into Orthanc (`Port 4242`) or are uploaded to the PACS Study Browser (`Port 3005/3001`).
2. The clinician selects a study in the PACS Browser or opens a direct URL (`/viewer/{studyUid}`).
3. The MerilView frontend queries the backend API (`/api/studies/{studyUid}/series`) for study structure and series metadata.
4. The series filmstrip loads preview thumbnails, allowing instant series switching.

### Workflow 2: High-Performance Image Streaming
1. When a viewport displays a slice, CornerstoneJS requests the DICOM instance:
   * Direct DICOMweb WADO-RS: `GET /dicom-web/studies/{studyUid}/series/{seriesUid}/instances/{sopInstanceUid}/frames/{frame}`
   * Or Backend Instance Stream: `GET /api/instances/{sopInstanceUid}/pixeldata`
2. The Web Worker pool decompresses the transfer syntax (JPEG, JPEG 2000, JPEG-LS) directly in WebAssembly.
3. The raw pixel array is mapped to Hounsfield Units (HU) using `RescaleSlope` and `RescaleIntercept`.
4. Window Width and Window Center (WW/WC) are computed dynamically via GPU-accelerated LUTs.

### Workflow 3: Multi-User Collaboration & Synchronization
1. When collaborative mode is activated, the viewer connects to the WebSocket hub (`ws://localhost:8000/ws/session/{sessionId}`).
2. Interactive actions (slice scrolling, panning, zooming, windowing, tool drawings) publish lightweight delta packets.
3. Connected peer viewports receive the broadcast and apply transformations smoothly, enabling multi-clinician diagnostic consultations.
