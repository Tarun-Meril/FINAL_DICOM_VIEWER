# MerilView DICOM Viewer - Ubuntu Linux Deployment & Operations Guide

This guide describes how to install, configure, deploy, and troubleshoot **MerilView DICOM Workstation** on **Ubuntu Linux** (22.04 LTS, 24.04 LTS, and future 26.04 LTS releases).

---

## 1. Supported Environments & System Requirements

### A. Supported Ubuntu Releases & Architectures
* **Ubuntu 24.04 LTS (Noble Numbat)**: Fully supported (`x86_64` / `amd64`).
* **Ubuntu 22.04 LTS (Jammy Jellyfish)**: Fully supported (`x86_64` / `amd64`).
* **Ubuntu 20.04 LTS (Focal Fossa)**: Supported with modern glibc / libfuse2.
* **Architecture**: 64-bit Intel/AMD (`x86_64` / `amd64`).
  * *ARM64 Note*: For ARM-based devices (e.g. Raspberry Pi 5, ARM64 workstations), a native ARM64 build can be produced by running `npm run build:desktop:linux -- --arm64` on an ARM64 host.

### B. Hardware Recommendations
| Component | Minimum Specification | Recommended Clinical Diagnostic Workstation |
| :--- | :--- | :--- |
| **CPU** | Quad-Core 2.0 GHz (x86_64) | 8-Core Intel Core i7 / AMD Ryzen 7 or Xeon |
| **System Memory (RAM)** | 4 GB | 16 GB+ (required for 500+ slice CT/MRI 3D MPR & Volume Rendering) |
| **GPU / Video Memory** | Integrated Intel UHD / AMD Radeon | Dedicated NVIDIA GeForce / RTX / AMD Radeon (Vulkan / WebGL 2.0) |
| **Disk Space** | 2 GB for installation | 50 GB+ SSD for persistent clinical DICOM cache |
| **Display Resolution** | 1280 x 800 | 1920 x 1080 or 4K Medical Diagnostic Grade Display |

---

## 2. Prerequisites & System Libraries

Before installing, ensure required desktop runtime libraries and graphics drivers are installed:

```bash
sudo apt update
sudo apt install -y \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libpango-1.0-0 \
  libcairo2 \
  libasound2t64 \
  libfuse2t64 \
  xdg-utils
```

> [!NOTE]
> On **Ubuntu 22.04 LTS**, replace `libasound2t64` and `libfuse2t64` with `libasound2` and `libfuse2`. On **Ubuntu 24.04 LTS**, the 64-bit time transition packages (`libasound2t64` and `libfuse2t64`) are used by default.

---

## 3. Installation Instructions

### Option A: Debian Package (`.deb`) — Recommended

The `.deb` package installs MerilView into `/opt/MerilView`, registers desktop launchers, icons, and medical protocol schemes (`merilview://`, `medview://`).

```bash
# 1. Download or copy the generated package to your Ubuntu laptop:
#    merilview_1.0.1_amd64.deb

# 2. Install using apt (automatically resolves system dependencies):
sudo apt install -y ./merilview_1.0.1_amd64.deb

# Alternatively using dpkg:
sudo dpkg -i merilview_1.0.1_amd64.deb
sudo apt install -f -y
```

#### Launching the Debian Package:
* **Application Menu**: Open the Ubuntu Applications Menu (Super key) and search for **MerilView**.
* **Terminal**:
  ```bash
  merilview
  ```
  Or:
  ```bash
  /opt/MerilView/merilview
  ```

---

### Option B: Portable AppImage

The AppImage package is standalone and does not require system-wide root installation.

```bash
# 1. Grant executable permission:
chmod +x MerilView-1.0.1-x86_64.AppImage

# 2. Launch directly:
./MerilView-1.0.1-x86_64.AppImage
```

#### Ubuntu 24.04 LTS AppArmor & Sandbox Note:
Ubuntu 24.04 restricts unprivileged user namespaces by default (`kernel.apparmor_restrict_unprivileged_userns = 1`). If the AppImage refuses to run or outputs `SUID sandbox helper binary was found, but is not configured correctly`:

Run with the standard unprivileged container flag:
```bash
./MerilView-1.0.1-x86_64.AppImage --no-sandbox
```
Or allow user namespaces via system configuration:
```bash
sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
```

---

### Option C: Standalone Unpacked Directory

For portable thumb-drive execution or testing:

```bash
cd release/linux-unpacked
chmod +x merilview
./merilview
```

---

## 4. Persistent Clinical Storage & Directories

MerilView follows the Linux **XDG Base Directory Specification**:

* **Root Clinical Storage**: `~/.local/share/MerilView/`
  * `database/db.json` — Persistent DICOM study index and metadata catalog.
  * `dicom/` — Imported clinical DICOM instances and series files.
  * `studies/` — Cached multi-modality studies.
  * `exports/` — Exported DICOM ZIP archives and snapshots.
  * `logs/` — Runtime application logs:
    * `pacs_backend.log` — Express PACS Study Browser service logs.
    * `viewer_backend.log` — FastAPI / DICOMweb service logs.
  * `cache/` — Temporary viewport slice buffers and WebAssembly textures.

> [!IMPORTANT]
> The clinical database and DICOM studies in `~/.local/share/MerilView/` are **preserved across application upgrades and uninstalls**, ensuring patient studies are never lost during routine updates.

---

## 5. Network Configuration & Backend Architecture

MerilView supports two deployment topologies:

### Topology 1: Standalone Offline Laptop (Built-in PACS Archive)
* The built-in Express PACS service automatically starts on `http://127.0.0.1:3001`.
* Initial real clinical sample studies are automatically seeded into `~/.local/share/MerilView/dicom/`.
* No external server or internet connectivity is required.
* Ideal for mobile radiology clinics, field operations, and offline review.

### Topology 2: Hospital / Clinic Centralized PACS Deployment
* To connect the Ubuntu laptop to an enterprise PACS or central MerilView server on the hospital LAN:
  1. Set the environment variable before launch:
     ```bash
     export PACS_API_BASE_URL="http://192.168.1.100:3001"
     export API_BASE_URL="http://192.168.1.100:8000"
     merilview
     ```
  2. Or pass the endpoint as a launch argument:
     ```bash
     merilview --apiHost=http://192.168.1.100:3001
     ```
  3. Or launch via deep linking from a clinical EHR/RIS portal:
     ```bash
     xdg-open "merilview://viewer?apiHost=http://192.168.1.100:3001&studyUID=1.3.46.670589.33.1.63920660937429831000001.5462275000837404300"
     ```

### Network Ports Reference
| Port | Protocol | Component | Purpose |
| :--- | :--- | :--- | :--- |
| **3001** | HTTP / TCP | PACS Study Browser Backend | Study listing, series metadata, instance retrieval |
| **8000** | HTTP / WS | MerilView FastAPI Backend | Streaming, collaborative sessions, measurements |
| **8042** | HTTP / TCP | Orthanc PACS Server | Standard DICOMweb (QIDO-RS, WADO-RS, STOW-RS) |
| **4242** | DICOM / TCP | Orthanc C-STORE | Hospital modality push (CT, MRI scanners) |

---

## 6. Verification & Troubleshooting

### A. Diagnosing Issues via Terminal
Run MerilView with debug output to diagnose graphics or backend issues:

```bash
# Launch with standard Electron diagnostic logging:
merilview --enable-logging

# If running on a virtual machine or low-power GPU without hardware acceleration:
merilview --ignore-gpu-blocklist --enable-webgl
```

### B. Viewing Application Logs
Inspect real-time service logs:

```bash
# PACS Archive Service log:
tail -f ~/.local/share/MerilView/logs/pacs_backend.log

# DICOM Viewer Backend log:
tail -f ~/.local/share/MerilView/logs/viewer_backend.log
```

### C. Port Conflicts
If port `3001` or `8000` is in use by another application:
```bash
# Find process occupying port 3001:
lsof -i :3001

# Free the port:
fuser -k 3001/tcp
```
MerilView's `ServiceManager` automatically detects and clears unresponsive zombie processes on startup.

---

## 7. Upgrade & Uninstallation Instructions

### Upgrading MerilView
To install a new version over an existing installation:

```bash
sudo apt install -y ./merilview_<new_version>_amd64.deb
```
All patient data, measurements, and annotations stored in `~/.local/share/MerilView/` are preserved.

### Uninstallation
```bash
# Remove the application binary and desktop shortcuts:
sudo apt remove merilview

# (Optional) To completely purge all patient clinical data and DICOM cache:
rm -rf ~/.local/share/MerilView
```
