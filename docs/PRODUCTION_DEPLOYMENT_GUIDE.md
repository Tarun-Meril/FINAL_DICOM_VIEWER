# MerilView — Production Cross-Platform Desktop Deployment Guide

This document defines the production architecture, installation, data isolation, and deployment instructions for the **MerilView** unified medical imaging desktop platform across **Windows 10/11**, **macOS** (Apple Silicon `arm64` & Intel `x64`), and **Ubuntu/Linux** (`.deb` & `.AppImage`).

---

## 1. Executive Architecture & Design Overview

MerilView is packaged as a single, self-contained desktop application. Clinical end users install **MerilView** and launch a unified workstation without running external Docker containers or starting background terminal servers manually.

```text
                           ┌───────────────────────────┐
                           │   MerilView Desktop Shell │
                           │       (Electron 34)       │
                           └─────────────┬─────────────┘
                                         │
                         ┌───────────────┴───────────────┐
                         │                               │
                         ▼                               ▼
             ┌───────────────────────┐       ┌───────────────────────┐
             │  PACS Study Browser   │       │  DICOM Viewer Core    │
             │  - Patient Records    │       │  - Cornerstone3D 4.17 │
             │  - Search & Filtering │       │  - VTK.js 3D/VR       │
             │  - DICOM Import/Export│       │  - MPR Multi-planar   │
             │  - Sharing & QR Links │       │  - CPR Curved Planar  │
             └───────────┬───────────┘       └───────────▲───────────┘
                         │                               │
                         │      Select / Double-Click    │
                         └──────── StudyInstanceUID ─────┘
                                  (Navigates route)
```

### Key Architectural Pillars:
1. **Single Unified Application**:
   - Application launches directly into the **PACS Study Browser** (`/#/pacs`).
   - Selecting or double-clicking any study transfers the `StudyInstanceUID` into the route (`/#/viewer/:studyInstanceUID`) in the **same Electron window**.
   - Returning to PACS is instant via the **"← Back to PACS"** button or `Ctrl+B` / `File -> PACS Study Browser`.
2. **Zero Docker Requirement for End Users**:
   - Electron bundles Node.js internally. The PACS Archive Service is orchestrated by Electron at launch using `ELECTRON_RUN_AS_NODE=1`.
   - SQLite and local JSON persistent data stores run entirely client-side without PostgreSQL, Redis, or Docker Desktop.
3. **Clinical Data Isolation**:
   - Application binaries (`Program Files`, `/Applications`, `/usr/bin`) are strictly separated from clinical DICOM data and database records (`ProgramData`, `Application Support`, `.local/share`).
   - Upgrades, reinstalls, and uninstalls preserve patient data unless explicitly wiped.
4. **Single-Instance Enforcement & Deep Linking**:
   - Secondary launches focus the running instance and forward target study deep links.
   - Dual-protocol registration: supports `merilview://` and backward-compatible `medview://`.

---

## 2. Platform-Specific Persistent Data Storage

Clinical databases, logs, DICOM instances, and user preferences are saved to standard OS persistent paths:

| Platform | Application Binaries | Persistent Clinical Data Root | Logs Location |
| :--- | :--- | :--- | :--- |
| **Windows 10 / 11** | `C:\Program Files\MerilView\` | `C:\ProgramData\MerilView\` | `C:\ProgramData\MerilView\logs\` |
| **macOS** | `/Applications/MerilView.app/` | `~/Library/Application Support/MerilView/` | `~/Library/Application Support/MerilView/logs/` |
| **Ubuntu / Linux** | `/usr/bin/merilview` or `.AppImage` | `~/.local/share/MerilView/` | `~/.local/share/MerilView/logs/` |

### Internal Directory Layout
```text
<PersistentDataRoot>/
├── database/
│   ├── db.json             # PACS study metadata & indexed series
│   └── merilview.db        # SQLite clinical database
├── dicom/                  # Ingested DICOM instances & series files
├── studies/                # Temporary extracted study archives
├── exports/                # Exported reports, screenshots, and videos
├── cache/                  # Decoded pixel cache & thumbnail cache
├── config/                 # User settings, hanging protocols, layout preferences
└── logs/
    ├── pacs_backend.log    # PACS Archive Service standard output & errors
    └── viewer_backend.log  # Diagnostic engine log output
```

> **Data Preservation**: The NSIS installer (`installer.nsh`) explicitly skips `$APPDATA\MerilView` upon uninstall or update. Patient studies and measurements remain intact across version upgrades.

---

## 3. Windows 10/11 Production Deployment

### Prerequisites & Minimum System Requirements
- **OS**: Windows 10 (Build 19041+) or Windows 11 (64-bit).
- **CPU**: Intel Core i5 / AMD Ryzen 5 or higher.
- **RAM**: 8 GB minimum (16 GB recommended for 1000+ slice CT volumes).
- **GPU**: DirectX 11 / OpenGL 3.3 compatible GPU (Intel Iris Xe, NVIDIA GeForce/Quadro, AMD Radeon).
- **Docker Required?**: **NO**.
- **Admin Rights**: Standard administrative privileges during installation (to write to `Program Files` and `ProgramData`).

### Generating the Windows Installer
Run from the repository root:
```bash
npm run build:desktop:win
```
Output artifact:
```text
dicom ui viewer/frontend/release/MerilView Setup.exe
```

### Installation Steps
1. Double-click `MerilView Setup.exe`.
2. Choose installation folder (default: `C:\Program Files\MerilView`).
3. The installer creates:
   - Start Menu entry: **MerilView**
   - Desktop shortcut: **MerilView**
   - Registry protocol handler: `merilview://` and `medview://`
   - Persistent directory: `C:\ProgramData\MerilView`
4. Launch **MerilView**. The PACS Study Browser appears immediately with pre-loaded demo studies.

### Firewall Configuration
The PACS Archive Service binds strictly to loopback (`127.0.0.1:3001`). No incoming external firewall exceptions are necessary for local workstation usage. If connecting to a hospital-wide PACS server (C-STORE SCU), permit port 11112 outbound.

---

## 4. macOS Production Deployment

### Supported Architectures
- **Apple Silicon (`arm64`)**: Native M1, M2, M3, M4 Macs.
- **Intel (`x64`)**: Legacy Intel Macs with macOS 12+ (Monterey, Ventura, Sonoma, Sequoia).
- **Universal Binary**: Single bundle containing both architectures.

### Generating the macOS DMG & App
Run from macOS runner or environment:
```bash
npm run build:desktop:mac
```
Output artifacts:
```text
dicom ui viewer/frontend/release/MerilView.dmg
dicom ui viewer/frontend/release/MerilView.app
```

### Hardened Runtime & Notarization
The macOS build configuration includes hardened runtime entitlements (`entitlements.mac.plist`):
- `com.apple.security.cs.allow-jit` (required for V8 execution and WebGL vertex shaders)
- `com.apple.security.cs.allow-unsigned-executable-memory` (required for WebAssembly JPEG-LS / OpenJPEG DICOM codecs)
- `com.apple.security.network.client` & `com.apple.security.network.server` (required for 127.0.0.1 loopback IPC)

To sign and notarize in Apple Developer CI/CD:
```bash
export CSC_LINK="/path/to/developer_id_certificate.p12"
export CSC_KEY_PASSWORD="certificate_password"
export APPLE_ID="developer@meril.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"

npm run build:desktop:mac
```

---

## 5. Ubuntu/Linux Production Deployment

### Supported Distributions
- **Ubuntu 20.04 LTS (Focal Fossa)**
- **Ubuntu 22.04 LTS (Jammy Jellyfish)**
- **Ubuntu 24.04 LTS (Noble Numbat)**
- Compatible with Debian 11/12, Linux Mint, and Fedora 38+.

### Generating Linux Packages
Run:
```bash
npm run build:desktop:linux
```
Output artifacts:
```text
dicom ui viewer/frontend/release/MerilView.deb
dicom ui viewer/frontend/release/MerilView.AppImage
```

### Installation via `.deb`
```bash
sudo dpkg -i MerilView.deb
sudo apt-get install -f   # Resolves any standard desktop dependencies if needed
```
This registers `/usr/share/applications/merilview.desktop`, installs icons to `/usr/share/icons/hicolor`, and registers mime types for `x-scheme-handler/merilview`, `x-scheme-handler/medview`, and `application/dicom`.

### Execution via `.AppImage`
```bash
chmod +x MerilView.AppImage
./MerilView.AppImage
```

---

## 6. Deep Linking Protocol Verification

MerilView registers both `merilview://` and `medview://` protocols.

### Supported Deep Link Formats:
1. **Open Specific Study**:
   ```text
   merilview://viewer?studyInstanceUID=1.3.46.670589.33.1.63920615320101214800001.4780975902838153948
   medview://viewer?studyInstanceUID=1.3.46.670589.33.1.63920615320101214800001.4780975902838153948
   ```
2. **Access Shared Clinical Token**:
   ```text
   merilview://share/d41d8cd98f00b204e9800998ecf8427e
   medview://share/d41d8cd98f00b204e9800998ecf8427e
   ```
3. **Open PACS Browser**:
   ```text
   merilview://pacs
   ```

### Testing Deep Links:
- **Windows**: Press `Win + R`, paste `merilview://viewer?studyInstanceUID=1.3.46...` and press Enter.
- **macOS**: In Terminal, run `open "merilview://viewer?studyInstanceUID=1.3.46..."`.
- **Linux**: In Terminal, run `xdg-open "merilview://viewer?studyInstanceUID=1.3.46..."`.

---

## 7. Developer vs. Production Launch Modes

| Mode | Command | Behavior |
| :--- | :--- | :--- |
| **Electron Dev** | `npm run dev:electron` | Boots Vite HMR on `localhost:5174` and launches Electron shell connected to dev server. |
| **All Web Dev** | `npm run dev` | Runs PACS browser (port 3005) and DICOM viewer (port 5174) in standard browser. |
| **Production Build** | `npm run build:desktop` | Runs WASM staging, TypeScript typecheck, Vite production compilation, and electron-builder packaging. |
| **Packaged App** | Double click `MerilView.exe` | Launches standalone; automatically orchestrates local PACS service and embedded database. |

---

## 8. Safe Shutdown & Process Management

When the user exits MerilView (via window close button, menu `File -> Exit`, or `Alt+F4`):
1. Electron intercepts `before-quit`.
2. `serviceManager.shutdown()` is called:
   - On Windows: gracefully terminates spawned backend child processes via `taskkill /pid <PID> /f /t`.
   - On macOS/Linux: dispatches `SIGTERM` followed by cleanup.
3. IPC listeners and WebGL contexts are released.
4. Clinical data in `ProgramData` / `Application Support` is never wiped or corrupted.

---

## 9. Troubleshooting & Health Diagnostics

- **If PACS services do not respond on startup**:
  1. Click **Open Logs** on the startup alert modal or open `<PersistentDataRoot>/logs/pacs_backend.log`.
  2. Verify that no other process is bound to port `3001` (`netstat -ano | findstr :3001` on Windows, `lsof -i :3001` on Unix).
  3. Click **Retry** on the modal.
- **GPU Context Loss**:
  - MerilView includes `--max-active-webgl-contexts=64` and `--ignore-gpu-blocklist` to ensure that multi-viewport 2D/MPR/VR displays do not exhaust GPU contexts.
- **Corrupt Database Recovery**:
  - The application automatically recreates `db.json` from bundled backup templates if the file is removed or truncated.
