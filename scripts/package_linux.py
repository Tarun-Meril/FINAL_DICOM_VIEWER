#!/usr/bin/env python3
"""
MerilView Linux Packaging Script
Builds both .deb and .AppImage packages from the prepackaged linux-unpacked directory.
Can be executed directly on Ubuntu Linux or inside WSL2 Ubuntu.
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = REPO_ROOT / "dicom ui viewer" / "frontend"
RELEASE_DIR = FRONTEND_DIR / "release"
LINUX_UNPACKED = RELEASE_DIR / "linux-unpacked"
ICONS_DIR = FRONTEND_DIR / "build" / "icons"
CACHE_DIR = Path(os.path.expanduser("~/.cache/electron-builder")) if os.name != 'nt' else Path(os.environ.get("LOCALAPPDATA", "")) / "electron-builder" / "Cache"

ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512]
VERSION = "1.0.1"
PKG_NAME = "merilview"

def check_prerequisites():
    if not LINUX_UNPACKED.exists():
        print(f"[ERROR] linux-unpacked directory does not exist at {LINUX_UNPACKED}")
        sys.exit(1)
    if not ICONS_DIR.exists():
        print(f"[ERROR] icons directory does not exist at {ICONS_DIR}")
        sys.exit(1)
    print(f"[OK] Prerequisites found: {LINUX_UNPACKED}")

def build_deb(work_dir: Path):
    print("\n--- Building Debian Package (.deb) ---")
    deb_root = work_dir / "deb_pkg"
    if deb_root.exists():
        shutil.rmtree(deb_root)
    deb_root.mkdir(parents=True, exist_ok=True)

    # 1. DEBIAN metadata
    debian_dir = deb_root / "DEBIAN"
    debian_dir.mkdir(parents=True, exist_ok=True)

    control_content = f"""Package: {PKG_NAME}
Version: {VERSION}
Section: science
Priority: optional
Architecture: amd64
Maintainer: Meril Life Sciences <support@merillife.com>
Depends: libnotify4, libxtst6, libnss3, libasound2 | libasound2t64, libgbm1
Homepage: https://www.merillife.com
Description: MerilView Medical Imaging PACS and Advanced 2D/3D DICOM Workstation
 Unified medical diagnostic workstation featuring PACS study archive browsing,
 Cornerstone3D multiplanar reconstruction (MPR), curved planar reconstruction (CPR),
 and VTK.js volumetric rendering.
"""
    (debian_dir / "control").write_text(control_content, encoding="utf-8")

    postinst_content = """#!/bin/sh
set -e
chmod 4755 /opt/MerilView/chrome-sandbox 2>/dev/null || true
if [ -x /usr/bin/update-desktop-database ]; then
    update-desktop-database -q /usr/share/applications 2>/dev/null || true
fi
if [ -x /usr/bin/gtk-update-icon-cache ]; then
    gtk-update-icon-cache -q /usr/share/icons/hicolor 2>/dev/null || true
fi
"""
    postinst_file = debian_dir / "postinst"
    postinst_file.write_text(postinst_content, encoding="utf-8")
    os.chmod(postinst_file, 0o755)

    postrm_content = """#!/bin/sh
set -e
if [ -x /usr/bin/update-desktop-database ]; then
    update-desktop-database -q /usr/share/applications 2>/dev/null || true
fi
if [ -x /usr/bin/gtk-update-icon-cache ]; then
    gtk-update-icon-cache -q /usr/share/icons/hicolor 2>/dev/null || true
fi
"""
    postrm_file = debian_dir / "postrm"
    postrm_file.write_text(postrm_content, encoding="utf-8")
    os.chmod(postrm_file, 0o755)

    # 2. /opt/MerilView
    opt_dest = deb_root / "opt" / "MerilView"
    opt_dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"Copying application payload to /opt/MerilView (from {LINUX_UNPACKED})...")
    shutil.copytree(LINUX_UNPACKED, opt_dest, symlinks=True)

    # 3. /usr/bin/merilview symlink
    bin_dir = deb_root / "usr" / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    bin_symlink = bin_dir / PKG_NAME
    if bin_symlink.is_symlink() or bin_symlink.exists():
        bin_symlink.unlink()
    bin_symlink.symlink_to("/opt/MerilView/merilview")

    # 4. /usr/share/applications/merilview.desktop
    desktop_dir = deb_root / "usr" / "share" / "applications"
    desktop_dir.mkdir(parents=True, exist_ok=True)
    desktop_content = """[Desktop Entry]
Name=MerilView
Exec=/opt/MerilView/merilview --no-sandbox %U
Terminal=false
Type=Application
Icon=merilview
StartupWMClass=merilview
Categories=Graphics;MedicalSoftware;Science;
MimeType=x-scheme-handler/merilview;x-scheme-handler/medview;application/dicom;
Comment=Unified medical diagnostic workstation featuring PACS study archive browsing, Cornerstone3D multiplanar reconstruction (MPR), curved planar reconstruction (CPR), and VTK.js volumetric rendering.
"""
    (desktop_dir / "merilview.desktop").write_text(desktop_content, encoding="utf-8")

    # 5. Icons in /usr/share/icons/hicolor/<size>x<size>/apps/merilview.png
    for sz in ICON_SIZES:
        sz_dir = deb_root / "usr" / "share" / "icons" / "hicolor" / f"{sz}x{sz}" / "apps"
        sz_dir.mkdir(parents=True, exist_ok=True)
        src_icon = ICONS_DIR / f"{sz}x{sz}.png"
        if src_icon.exists():
            shutil.copy2(src_icon, sz_dir / "merilview.png")

    deb_output = RELEASE_DIR / f"{PKG_NAME}_{VERSION}_amd64.deb"
    print(f"Building deb package with dpkg-deb: {deb_output}...")
    subprocess.run(
        ["dpkg-deb", "--build", "--root-owner-group", str(deb_root), str(deb_output)],
        check=True
    )
    print(f"[SUCCESS] Debian package created: {deb_output} ({deb_output.stat().st_size / 1024 / 1024:.1f} MB)")
    return deb_output

def build_appimage(work_dir: Path):
    print("\n--- Building AppImage ---")
    appdir = work_dir / "AppDir"
    if appdir.exists():
        shutil.rmtree(appdir)
    appdir.mkdir(parents=True, exist_ok=True)

    # 1. Copy payload to AppDir
    print(f"Copying application payload to AppDir...")
    for item in LINUX_UNPACKED.iterdir():
        dest = appdir / item.name
        if item.is_dir():
            shutil.copytree(item, dest, symlinks=True)
        else:
            shutil.copy2(item, dest)

    # 2. Add icons to AppDir/usr/share/icons/hicolor
    for sz in ICON_SIZES:
        sz_dir = appdir / "usr" / "share" / "icons" / "hicolor" / f"{sz}x{sz}" / "apps"
        sz_dir.mkdir(parents=True, exist_ok=True)
        src_icon = ICONS_DIR / f"{sz}x{sz}.png"
        if src_icon.exists():
            shutil.copy2(src_icon, sz_dir / "merilview.png")

    # Root symlinks for AppImage specification
    icon_512 = "usr/share/icons/hicolor/512x512/apps/merilview.png"
    (appdir / "merilview.png").symlink_to(icon_512)
    (appdir / ".DirIcon").symlink_to(icon_512)

    # Desktop file
    desktop_content = """[Desktop Entry]
Name=MerilView
Exec=AppRun --no-sandbox %U
Terminal=false
Type=Application
Icon=merilview
StartupWMClass=merilview
X-AppImage-Version=1.0.1
Categories=MedicalSoftware;
MimeType=x-scheme-handler/merilview;x-scheme-handler/medview;
Comment=Unified medical diagnostic workstation featuring PACS study archive browsing, Cornerstone3D multiplanar reconstruction (MPR), curved planar reconstruction (CPR), and VTK.js volumetric rendering.
"""
    (appdir / "merilview.desktop").write_text(desktop_content, encoding="utf-8")

    # AppRun launcher script
    apprun_src = RELEASE_DIR / "__appImage-x64" / "AppRun"
    apprun_dest = appdir / "AppRun"
    if apprun_src.exists():
        shutil.copy2(apprun_src, apprun_dest)
    else:
        apprun_dest.write_text("""#!/bin/bash
HERE="$(dirname "$(readlink -f "${0}")")"
export PATH="${HERE}:${PATH}"
export LD_LIBRARY_PATH="${HERE}/usr/lib:${LD_LIBRARY_PATH}"
exec "${HERE}/merilview" --no-sandbox "$@"
""", encoding="utf-8")
    os.chmod(apprun_dest, 0o755)

    # Find runtime-x64 and mksquashfs
    # Search in cache or appimage-12.0.1
    runtime_candidates = list(Path("/mnt/c/Users/Tarun/AppData/Local/electron-builder/Cache/appimage").glob("**/runtime-x64"))
    if not runtime_candidates:
        runtime_candidates = list(Path.home().glob(".cache/electron-builder/**/runtime-x64"))
    
    mksquashfs_candidates = list(Path("/mnt/c/Users/Tarun/AppData/Local/electron-builder/Cache/appimage").glob("**/linux-x64/mksquashfs"))
    if not mksquashfs_candidates:
        mksquashfs_candidates = list(Path.home().glob(".cache/electron-builder/**/linux-x64/mksquashfs"))

    if not runtime_candidates or not mksquashfs_candidates:
        print("[WARN] Could not find electron-builder runtime-x64 or mksquashfs. Checking system mksquashfs...")
        mksquashfs_bin = shutil.which("mksquashfs")
    else:
        runtime_file = runtime_candidates[0]
        mksquashfs_bin = str(mksquashfs_candidates[0])
        print(f"Using runtime: {runtime_file}")
        print(f"Using mksquashfs: {mksquashfs_bin}")

    appimage_output = RELEASE_DIR / f"MerilView-{VERSION}-x86_64.AppImage"
    if appimage_output.exists():
        appimage_output.unlink()

    # Prepend runtime-x64 (188392 bytes)
    runtime_bytes = runtime_file.read_bytes()
    offset = len(runtime_bytes)
    with open(appimage_output, "wb") as f:
        f.write(runtime_bytes)

    # Append squashfs with offset
    print(f"Creating squashfs filesystem at offset {offset}...")
    subprocess.run(
        [
            mksquashfs_bin,
            str(appdir),
            str(appimage_output),
            "-offset", str(offset),
            "-all-root",
            "-noappend",
            "-no-progress",
            "-quiet",
            "-no-xattrs",
            "-no-fragments"
        ],
        check=True
    )

    os.chmod(appimage_output, 0o755)
    print(f"[SUCCESS] AppImage created: {appimage_output} ({appimage_output.stat().st_size / 1024 / 1024:.1f} MB)")
    return appimage_output

def main():
    check_prerequisites()
    work_dir = Path("/tmp/merilview_build")
    if work_dir.exists():
        shutil.rmtree(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)

    deb_path = build_deb(work_dir)
    appimage_path = build_appimage(work_dir)

    # Clean up temp
    shutil.rmtree(work_dir, ignore_errors=True)

    print("\n==========================================")
    print("ALL LINUX PACKAGES GENERATED SUCCESSFULLY!")
    print(f"Debian Package: {deb_path}")
    print(f"AppImage Package: {appimage_path}")
    print("==========================================")

if __name__ == "__main__":
    main()
