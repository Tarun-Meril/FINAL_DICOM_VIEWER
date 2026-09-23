# MedView PRO DICOM Workstation - Technology Stack

This document presents a comprehensive audit of all frameworks, libraries, rendering engines, and infrastructure components across the MedView PRO DICOM Workstation.

---

## 1. Diagnostic Viewer (Frontend)

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **UI Framework** | React | `19.2.7` | Reactive component tree and modern concurrent rendering |
| **Language** | TypeScript | `6.0.3` | Static typing, interface contracts, and clinical type safety |
| **Build & Dev Server** | Vite | `5.4.11` | Hot module replacement (HMR), ES module bundling, WASM integration |
| **Styling** | Tailwind CSS | `4.3.1` | Modern utility styling via `@tailwindcss/vite` |
| **Desktop Shell** | Electron | `34.0.0` | Native Windows desktop runtime with frameless window chrome |
| **Desktop Bundler** | Electron Builder | `25.1.8` | Windows NSIS installer compilation (`.exe`) |
| **State Management** | Zustand | `5.0.15` | Fast, un-opinionated state store for viewport and tool parameters |
| **Icons** | Lucide React | `1.46.0` | Comprehensive medical workstation icon set |

---

## 2. Medical Imaging & DICOM Decoding Engine

| Component | Package | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Core 2D/3D Engine** | `@cornerstonejs/core` | `4.17.2` | Viewport rendering, volume loaders, rendering pipelines |
| **DICOM Loader** | `@cornerstonejs/dicom-image-loader` | `4.17.2` | WADO-RS & WADO-URI multi-frame parsing and Web Worker caching |
| **Clinical Tools** | `@cornerstonejs/tools` | `4.17.2` | Pan, zoom, window/level, length, Cobb angle, CTR calipers |
| **JPEG-LS WASM** | `@cornerstonejs/codec-charls` | `1.2.3` | Lossless / near-lossless JPEG-LS WebAssembly decompression |
| **JPEG 2000 WASM** | `@cornerstonejs/codec-openjpeg` | `1.3.0` | 12/16-bit JPEG 2000 WebAssembly decoding |
| **JPEG Baseline WASM** | `@cornerstonejs/codec-libjpeg-turbo-8bit` | `1.2.2` | High-speed SIMD-accelerated 8-bit JPEG decoding |
| **HTJ2K WASM** | `@cornerstonejs/codec-openjph` | `2.4.7` | High-Throughput JPEG 2000 decompression |
| **3D Volume Visualizer** | `@kitware/vtk.js` | `36.14.2` | GPU ray-casting, volume shaders, Phong lighting |
| **DICOM Parser** | `dicom-parser` & `dcmjs` | `1.8.21` / `0.49.4` | Low-level DICOM header extraction, SOP instance validation |
| **Matrix Math** | `gl-matrix` | `3.4.4` | Vector transformations for Patient Coordinate Space (LPS) |

---

## 3. API & Backend Services

| Component | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **API Framework** | FastAPI | `>=0.110.0` | Asynchronous Python REST and WebSocket gateway |
| **ASGI Server** | Uvicorn | `>=0.28.0` | High-performance asynchronous HTTP/WebSocket server |
| **Language** | Python | `>=3.12` | Core backend programming runtime |
| **DICOM Parsing** | `pydicom` | `>=2.4.0` | Native Python DICOM header reading and pixel array extraction |
| **Array & Image Math**| `numpy` & `Pillow` | `>=1.24.0` / `>=10.0.0` | Rescale slope/intercept math, Hounsfield Unit mapping, PNG stream buffers |
| **Database ORM** | SQLAlchemy | `>=2.0.0` | Relational models and session management |
| **Schema Migrations** | Alembic | `>=1.13.0` | Declarative, version-controlled database schema migrations |
| **Relational Database**| PostgreSQL | `16-alpine` | Production database for annotations, users, and audit logs |
| **Task Queue & Broker**| Celery & Redis | `>=5.3.0` / `7-alpine` | Distributed asynchronous tasks (thumbnails, AI, export bundling) |
| **Authentication** | `python-jose` & `passlib` | `>=3.3.0` / `>=1.7.4` | JWT token issuance and cryptographic password hashing |

---

## 4. PACS Study Browser

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Frontend UI** | React + Vite + TypeScript | `18.3.1` / `5.3.1` | Standalone study registry and search dashboard |
| **Backend API** | Express.js + TypeScript | `4.19.2` / `5.3.3` | Study management API and file upload coordinator |
| **File Ingestion** | `multer` & `dicom-parser` | `1.4.5` / `1.8.21` | Multi-part `.dcm` upload handling and metadata indexing |
| **Database** | JSON Flat Store (`db.json`) | Native | Lightweight persistent study catalog |

---

## 5. Specialized 3D & MPR Engines

### MedView VR (3D Volume Rendering)
* **Rendering**: WebGL 2, GPU ray casting with VTK.js (`@kitware/vtk.js/Rendering/Profiles/Volume`).
* **Hounsfield Unit Precision**: Full modality LUT with slope/intercept verification.
* **Interactive Controls**: Transfer function histogram editor, VOI crop boxes, multi-planar clipping planes, and 3D segmentation sculpting.

### Standalone 2D MPR (Multi-Planar Reconstruction)
* **Reconstruction**: True axial, coronal, and sagittal cross-referenced reformats.
* **SharedArrayBuffer**: Enabled via Cross-Origin Isolation (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`).
* **Validation Suite**: Procedural phantom generator creating synthetic CT/MRI volumes for millimeter geometric conformance testing.

---

## 6. Containerization & DevOps

* **Docker & Docker Compose**: Unified multi-container orchestration.
* **Nginx Alpine**: High-speed production web server configured with:
  * SPA route fallback (`try_files $uri $uri/ /index.html;`)
  * Cross-Origin Isolation headers (`COOP: same-origin` / `COEP: require-corp`)
  * WebAssembly MIME type mapping (`application/wasm`)
  * Gzip compression for static bundles
* **Orthanc PACS**: Official `jodogne/orthanc-plugins:1.12.3` container providing automated DICOMweb endpoints (`/dicom-web/`) and DICOM C-STORE service on port `4242`.
