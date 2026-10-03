# MerilView DICOM Workstation - Technical & Architectural Audit Report

This document compiles the architectural audit findings, clinical safety reviews, security posture, and performance optimizations for the MerilView DICOM Workstation.

---

## 1. Architectural Evolution & Current Status

The workstation has evolved from a basic image-streaming prototype into an enterprise-grade multi-modality diagnostic platform:
1. **Client-Side WASM Decoders**: Replaced server-side dynamic PNG compression with client-side WebAssembly codecs (`CharLS`, `OpenJPEG`, `libjpeg-turbo`), offloading decoding computation to multi-threaded client Web Workers.
2. **True 2D MPR & 3D Volume Rendering**: Added production-grade 2D Multi-Planar Reconstruction (Cornerstone3D) and GPU-accelerated ray-cast 3D volume rendering (VTK.js).
3. **Cross-Origin Isolation Architecture**: Configured strict `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` HTTP headers to unlock zero-copy `SharedArrayBuffer` high-throughput memory streaming.
4. **Standardized DICOMweb Integration**: Integrated full QIDO-RS, WADO-RS, and STOW-RS communication pipelines backed by Orthanc PACS.

---

## 2. Security & Compliance Findings

### A. Authentication & Session Security
* **JWT Secret Management**: Default `SECRET_KEY` in `backend/.env.example` must be replaced with an entropy-rich cryptographic key generated via `openssl rand -hex 32` for production deployments.
* **CORS Scope**: The FastAPI CORS middleware is currently set to `allow_origins=["*"]` to accommodate multiple development ports (`5174`, `3005`, `5173`, `5176`). For clinical production deployments, origins should be restricted to the verified workstation hostnames.
* **PHI Protection (HIPAA Compliance)**: All data in transit must be routed through TLS 1.3 reverse proxies (HTTPS/WSS). Plaintext HTTP and WS protocols should be blocked at the network perimeter.

### B. Database Concurrency & Migrations
* **PostgreSQL Relational Store**: The primary database runs PostgreSQL 16 with Alembic version-controlled schema migrations.
* **Local SQLite Fallback**: SQLite fallback is supported for zero-setup local developer testing, but is restricted from production use due to single-writer database locking constraints under concurrent clinical usage.

---

## 3. Imaging Performance & Memory Management

### A. WebAssembly Worker Lifecycles
* CornerstoneJS and VTK.js allocate memory directly in WebAssembly heaps. The frontend implements explicit disposal handlers (`renderingEngine.destroy()`, volume cache invalidation) on route unmounts to prevent memory leaks during extended diagnostic review sessions.

### B. SharedArrayBuffer Isolation
* High-volume CT/MRI series (e.g. 500+ slices) require zero-copy array buffer sharing across worker threads. Production web servers (Nginx) and Vite development servers are configured with mandatory `COOP` and `COEP` headers to ensure modern browser security compliance.

### C. Celery Worker Throughput
* Heavy compute tasks (DICOM ZIP packaging, high-resolution thumbnail generation, AI segmentation jobs) are dispatched across dedicated task queues (`default`, `thumbnail_queue`, `ai_queue`, `upload_queue`, `export_queue`), ensuring the core REST API remains completely non-blocking.

---

## 4. Remediation Checklist

- [x] **Cross-Origin Isolation**: Implemented COOP/COEP headers across development Vite servers and production Nginx containers.
- [x] **Client-Side SPA Routing**: Added Nginx `try_files $uri $uri/ /index.html;` to eliminate 404s on deep links (`/viewer/:studyUid`, `/mpr`, `/vr`).
- [x] **Windows Docker Compatibility**: Implemented `dos2unix` normalization on container startup scripts to prevent CRLF execution errors.
- [x] **Unified Multi-Service Orchestration**: Created root `docker-compose.yml` and root npm lifecycle scripts for single-command developer startup.
- [ ] **Automated TLS Encryption**: Integrate automated Let's Encrypt / ACME certificates into the production Nginx container for out-of-the-box HTTPS/WSS.
