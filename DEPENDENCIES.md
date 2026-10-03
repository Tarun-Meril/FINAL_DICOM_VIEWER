# MerilView DICOM Workstation - Master Dependencies Catalog

This document catalogues every production and development package utilized across all subsystems in the MerilView DICOM Workstation codebase.

---

## 1. MerilView Diagnostic Viewer Frontend (`dicom ui viewer/frontend`)

### Production Dependencies
```json
{
  "@cornerstonejs/codec-charls": "1.2.3",
  "@cornerstonejs/codec-libjpeg-turbo-8bit": "1.2.2",
  "@cornerstonejs/codec-openjpeg": "1.3.0",
  "@cornerstonejs/codec-openjph": "2.4.7",
  "@cornerstonejs/core": "4.17.2",
  "@cornerstonejs/dicom-image-loader": "4.17.2",
  "@cornerstonejs/tools": "^4.17.2",
  "@kitware/vtk.js": "36.14.2",
  "@types/gl-matrix": "^2.4.5",
  "@types/seedrandom": "^3.0.8",
  "dcmjs": "0.49.4",
  "dicom-parser": "1.8.21",
  "gl-matrix": "^3.4.4",
  "lucide-react": "^1.46.0",
  "qrcode": "^1.5.4",
  "react": "^19.2.7",
  "react-dom": "^19.2.7",
  "seedrandom": "^3.0.5",
  "zustand": "^5.0.15"
}
```

### Development Dependencies
```json
{
  "@tailwindcss/vite": "^4.3.1",
  "@vitejs/plugin-react": "^4.3.1",
  "concurrently": "^9.1.2",
  "cross-env": "^7.0.3",
  "electron": "^34.0.0",
  "electron-builder": "^25.1.8",
  "playwright": "^1.62.1",
  "tailwindcss": "^4.3.1",
  "typescript": "^6.0.3",
  "vite": "^5.4.11",
  "vite-plugin-commonjs": "^0.10.4",
  "vite-plugin-top-level-await": "^1.6.0",
  "vite-plugin-wasm": "^3.6.0",
  "wait-on": "^8.0.5"
}
```

---

## 2. MerilView Backend API (`dicom ui viewer/backend`)

### Python Packages (`requirements.txt`)
* **FastAPI Core**: `fastapi>=0.110.0`, `uvicorn[standard]>=0.28.0`, `pydantic>=2.6.0`, `pydantic-settings>=2.2.0`
* **Relational Database**: `sqlalchemy>=2.0.0`, `psycopg2-binary>=2.9.0`, `alembic>=1.13.0`
* **Imaging & Numeric Computation**: `pydicom>=2.4.0`, `pillow>=10.0.0`, `numpy>=1.24.0`
* **Asynchronous Queue & Cache**: `redis>=5.0.0`, `celery>=5.3.0`
* **Security & Tokens**: `python-jose[cryptography]>=3.3.0`, `passlib[bcrypt]>=1.7.4`
* **Networking & WebSockets**: `websockets>=12.0`, `python-multipart>=0.0.9`, `httpx>=0.27.0`
* **Observability & Configuration**: `prometheus-client>=0.20.0`, `python-dotenv>=1.0.1`, `email-validator>=2.0.0`

---

## 3. PACS Study Browser (`pacs-study-browser`)

### Frontend (`pacs-study-browser/frontend`)
* **Production**: `react@^18.3.1`, `react-dom@^18.3.1`, `lucide-react@^0.344.0`
* **Development**: `vite@^5.3.1`, `@vitejs/plugin-react@^4.3.1`, `typescript@^5.2.2`, `@types/react`, `@types/react-dom`

### Backend (`pacs-study-browser/backend`)
* **Production**: `express@^4.19.2`, `cors@^2.8.5`, `dicom-parser@^1.8.21`, `multer@^1.4.5-lts.1`, `dotenv@^17.4.2`, `@supabase/supabase-js@^2.110.1`
* **Development**: `ts-node-dev@^2.0.0`, `typescript@^5.3.3`, `jest@^30.4.2`, `supertest@^7.2.2`, `ts-jest@^29.4.11`

---

## 4. MerilView VR 3D Engine (`medview-vr`)

### Key Packages
* **Production**: `@kitware/vtk.js`, `dicom-parser`, `fflate`, `jpeg-lossless-decoder-js`, `react`, `react-dom`, `zustand`
* **Testing & Build**: `vite`, `@vitejs/plugin-react`, `vitest`, `playwright`, `typescript`

---

## 5. Standalone 2D MPR Engine (`mpr building/mpr building`)

### Key Packages
* **Production**: `@cornerstonejs/core`, `@cornerstonejs/tools`, `@cornerstonejs/dicom-image-loader`, `dicom-parser`, `react`, `react-dom`
* **Development**: `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`

---

## 6. Workspace Root Orchestration

* **Dependencies**: `puppeteer@^25.10.0` (Automated browser testing and DOM validation)
* **Scripts**: Utilizes `concurrently` (delegated via pacs-study-browser) for parallel process execution
