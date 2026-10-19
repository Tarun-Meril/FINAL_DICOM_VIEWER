                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                #!/usr/bin/env python3
"""
Direct Python .deb package generator for MerilView
Creates a standards-compliant Debian .deb archive by streaming files
directly into control.tar.gz and data.tar.gz without copying trees on disk.
"""

import os
import sys
import time
import io
import tarfile
from pathlib import Path
import shutil

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = REPO_ROOT / "dicom ui viewer" / "frontend"
RELEASE_DIR = FRONTEND_DIR / "release"
LINUX_UNPACKED = RELEASE_DIR / "linux-unpacked"
ICONS_DIR = FRONTEND_DIR / "build" / "icons"
OUTPUT_DEB = RELEASE_DIR / "merilview_1.0.1_amd64.deb"

VERSION = "1.0.1"
PKG_NAME = "merilview"
ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512]

def make_ar_header(filename: str, size: int, mode: int = 0o100644) -> bytes:
    """Creates a 60-byte Unix ar archive header."""
    # Format:
    # 0-15: name (16 bytes, space padded, slash terminated in GNU ar or plain space in BSD)
    # 16-27: mtime (12 bytes)
    # 28-33: uid (6 bytes)
    # 34-39: gid (6 bytes)
    # 40-47: mode (8 bytes, octal)
    # 48-57: size (10 bytes)
    # 58-59: magic `\x60\n`
    name_field = (filename + "/").ljust(16)
    mtime_field = str(int(time.time())).ljust(12)
    uid_field = "0".ljust(6)
    gid_field = "0".ljust(6)
    mode_field = oct(mode)[2:].ljust(8)
    size_field = str(size).ljust(10)
    magic = b"`\n"
    header = (name_field + mtime_field + uid_field + gid_field + mode_field + size_field).encode("ascii") + magic
    assert len(header) == 60, f"Header length must be 60, got {len(header)}"
    return header

def build_control_tar() -> bytes:
    """Builds in-memory control.tar.gz containing control, postinst, postrm."""
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
""".encode("utf-8")

    postinst_content = b"""#!/bin/sh
set -e
chmod 4755 /opt/MerilView/chrome-sandbox 2>/dev/null || true
if [ -x /usr/bin/update-desktop-database ]; then
    update-desktop-database -q /usr/share/applications 2>/dev/null || true
fi
if [ -x /usr/bin/gtk-update-icon-cache ]; then
    gtk-update-icon-cache -q /usr/share/icons/hicolor 2>/dev/null || true
fi
"""

    postrm_content = b"""#!/bin/sh
set -e
if [ -x /usr/bin/update-desktop-database ]; then
    update-desktop-database -q /usr/share/applications 2>/dev/null || true
fi
if [ -x /usr/bin/gtk-update-icon-cache ]; then
    gtk-update-icon-cache -q /usr/share/icons/hicolor 2>/dev/null || true
fi
"""

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        # control file
        ti = tarfile.TarInfo(name="./control")
        ti.size = len(control_content)
        ti.mtime = int(time.time())
        ti.mode = 0o644
        ti.uname = "root"
        ti.gname = "root"
        tar.addfile(ti, io.BytesIO(control_content))

        # postinst file
        ti = tarfile.TarInfo(name="./postinst")
        ti.size = len(postinst_content)
        ti.mtime = int(time.time())
        ti.mode = 0o755
        ti.uname = "root"
        ti.gname = "root"
        tar.addfile(ti, io.BytesIO(postinst_content))

        # postrm file
        ti = tarfile.TarInfo(name="./postrm")
        ti.size = len(postrm_content)
        ti.mtime = int(time.time())
        ti.mode = 0o755
        ti.uname = "root"
        ti.gname = "root"
        tar.addfile(ti, io.BytesIO(postrm_content))

    return buf.getvalue()

def build_data_tar(tar_path: Path):
    """Builds data.tar.gz by streaming files directly from linux-unpacked."""
    print("Streaming files into data.tar.gz...")
    desktop_content = b"""[Desktop Entry]
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

    with tarfile.open(tar_path, mode="w:gz") as tar:
        # 1. Base directories
        for d in ["./opt", "./opt/MerilView", "./usr", "./usr/bin", "./usr/share", "./usr/share/applications", "./usr/share/icons", "./usr/share/icons/hicolor"]:
            ti = tarfile.TarInfo(name=d)
            ti.type = tarfile.DIRTYPE
            ti.mode = 0o755
            ti.mtime = int(time.time())
            ti.uname = "root"
            ti.gname = "root"
            tar.addfile(ti)

        # 2. Desktop file
        ti = tarfile.TarInfo(name="./usr/share/applications/merilview.desktop")
        ti.size = len(desktop_content)
        ti.mode = 0o644
        ti.mtime = int(time.time())
        ti.uname = "root"
        ti.gname = "root"
        tar.addfile(ti, io.BytesIO(desktop_content))

        # 3. Bin symlink
        ti = tarfile.TarInfo(name="./usr/bin/merilview")
        ti.type = tarfile.SYMTYPE
        ti.linkname = "/opt/MerilView/merilview"
        ti.mode = 0o777
        ti.mtime = int(time.time())
        ti.uname = "root"
        ti.gname = "root"
        tar.addfile(ti)

        # 4. Icons
        for sz in ICON_SIZES:
            icon_file = ICONS_DIR / f"{sz}x{sz}.png"
            if icon_file.exists():
                icon_dir = f"./usr/share/icons/hicolor/{sz}x{sz}/apps"
                ti = tarfile.TarInfo(name=icon_dir)
                ti.type = tarfile.DIRTYPE
                ti.mode = 0o755
                ti.mtime = int(time.time())
                ti.uname = "root"
                ti.gname = "root"
                tar.addfile(ti)

                icon_bytes = icon_file.read_bytes()
                ti = tarfile.TarInfo(name=f"{icon_dir}/merilview.png")
                ti.size = len(icon_bytes)
                ti.mode = 0o644
                ti.mtime = int(time.time())
                ti.uname = "root"
                ti.gname = "root"
                tar.addfile(ti, io.BytesIO(icon_bytes))

        # 5. Application payload (/opt/MerilView/...)
        print("Adding /opt/MerilView payload from linux-unpacked...")
        base_dir_str = str(LINUX_UNPACKED.resolve())
        walk_root = f"\\\\?\\{base_dir_str}" if os.name == 'nt' else base_dir_str
        count = 0
        for root, dirs, files in os.walk(walk_root):
            clean_root = root[4:] if root.startswith("\\\\?\\") else root
            rel_root = os.path.relpath(clean_root, base_dir_str)
            dest_root = "./opt/MerilView" if rel_root == "." else f"./opt/MerilView/{rel_root.replace('\\', '/')}"

            for d in dirs:
                arcname = f"{dest_root}/{d}"
                ti = tarfile.TarInfo(name=arcname)
                ti.type = tarfile.DIRTYPE
                ti.mode = 0o755
                ti.mtime = int(time.time())
                ti.uname = "root"
                ti.gname = "root"
                tar.addfile(ti)

            for f in files:
                file_path = os.path.join(root, f)
                arcname = f"{dest_root}/{f}"
                st = os.stat(file_path)
                ti = tarfile.TarInfo(name=arcname)
                ti.size = st.st_size
                ti.mtime = int(st.st_mtime)
                ti.uname = "root"
                ti.gname = "root"
                
                # Executable permissions for binaries, shared objects, and scripts
                if f in ["merilview", "chrome-sandbox", "chrome_crashpad_handler"] or f.endswith(".so") or f.endswith(".sh"):
                    ti.mode = 0o755
                else:
                    ti.mode = 0o644

                with open(file_path, "rb") as fp:
                    tar.addfile(ti, fp)
                count += 1
                if count % 1000 == 0:
                    print(f"  Added {count} files...")

        print(f"Total files added to /opt/MerilView: {count}")

def main():
    print(f"=== Generating Debian Package: {OUTPUT_DEB} ===")
    start_time = time.time()
    
    # 1. debian-binary data
    debian_binary = b"2.0\n"

    # 2. control.tar.gz data
    print("Building control.tar.gz...")
    control_tar = build_control_tar()

    # 3. data.tar.gz temporary file
    temp_data_tar = RELEASE_DIR / "data.tar.gz"
    build_data_tar(temp_data_tar)

    data_size = temp_data_tar.stat().st_size
    print(f"data.tar.gz created: {data_size / 1024 / 1024:.1f} MB")

    # 4. Assemble ar archive (.deb)
    print("Assembling final .deb archive...")
    with open(OUTPUT_DEB, "wb") as deb:
        # AR magic
        deb.write(b"!<arch>\n")

        # Member 1: debian-binary
        deb.write(make_ar_header("debian-binary", len(debian_binary)))
        deb.write(debian_binary)
        if len(debian_binary) % 2 != 0:
            deb.write(b"\n")

        # Member 2: control.tar.gz
        deb.write(make_ar_header("control.tar.gz", len(control_tar)))
        deb.write(control_tar)
        if len(control_tar) % 2 != 0:
            deb.write(b"\n")

        # Member 3: data.tar.gz
        deb.write(make_ar_header("data.tar.gz", data_size))
        with open(temp_data_tar, "rb") as df:
            shutil.copyfileobj(df, deb)
        if data_size % 2 != 0:
            deb.write(b"\n")

    # Clean up temp data.tar.gz
    if temp_data_tar.exists():
        temp_data_tar.unlink()

    duration = time.time() - start_time
    deb_size = OUTPUT_DEB.stat().st_size / 1024 / 1024
    print(f"[SUCCESS] .deb package created: {OUTPUT_DEB} ({deb_size:.1f} MB) in {duration:.1f}s")

if __name__ == "__main__":
    main()
