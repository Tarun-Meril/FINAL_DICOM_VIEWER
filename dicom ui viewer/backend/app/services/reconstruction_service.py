import io
import os
import glob
from typing import Optional, Dict, Any, List
import numpy as np
from PIL import Image
import pydicom
from fastapi import Response, HTTPException
from app.config.config import settings

STANDARD_HEADERS = {
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Cache-Control": "public, max-age=86400"
}

class ReconstructionService:
    def __init__(self):
        # Cache holding 3D volumes keyed by series_uid
        self.volume_cache: Dict[str, Dict[str, Any]] = {}
        # Predefined search paths for PACS DICOM files
        self.candidate_paths = [
            "/workspace/pacs_data",
            "/workspace/pacs_data/instances",
            "/workspace/storage",
            "./storage",
            "../pacs-study-browser/backend/data/instances",
            "g:/newww/Meril_Dicom_Viewer/pacs-study-browser/backend/data/instances",
            "../../pacs-study-browser/backend/data/instances"
        ]

    def _fetch_from_pacs_api(self, study_uid: str, series_uid: str) -> List[str]:
        """Fetches series slices directly from PACS API if local disk paths are not found"""
        import urllib.request
        import json
        
        configured_pacs = getattr(settings, 'PACS_BROWSER_URL', None) or "http://host.docker.internal:3001"
        pacs_urls = [
            configured_pacs,
            "http://host.docker.internal:3001",
            "http://127.0.0.1:3001",
            "http://localhost:3001",
        ]
        
        base_pacs_url = None
        for p_url in pacs_urls:
            if not p_url:
                continue
            try:
                with urllib.request.urlopen(f"{p_url}/api/health", timeout=5.0) as resp:
                    if resp.status == 200:
                        base_pacs_url = p_url
                        break
            except Exception:
                continue
                
        if not base_pacs_url:
            base_pacs_url = configured_pacs

        target_series_uid = series_uid
        # If series_uid is empty or missing, find the volumetric series with the most instances
        if not target_series_uid:
            try:
                url = f"{base_pacs_url}/api/studies/{study_uid}/series"
                with urllib.request.urlopen(url, timeout=3.0) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    series_list = data.get('data', [])
                    if series_list:
                        series_list.sort(key=lambda s: int(s.get('numberOfSeriesRelatedInstances') or 0), reverse=True)
                        target_series_uid = series_list[0].get('seriesInstanceUid')
            except Exception as e:
                print(f"[MPR] Error querying study series from PACS: {e}")

        if not target_series_uid:
            return []

        # Get instance list for this series
        try:
            url = f"{base_pacs_url}/api/series/{target_series_uid}/instances"
            with urllib.request.urlopen(url, timeout=5.0) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                instances = data.get('data', [])
        except Exception as e:
            print(f"[MPR] Error querying instances for series {target_series_uid}: {e}")
            return []

        if not instances:
            return []

        cache_dir = os.path.join("/tmp", "mpr_cache", study_uid, target_series_uid)
        os.makedirs(cache_dir, exist_ok=True)

        from concurrent.futures import ThreadPoolExecutor

        def _download_instance(inst):
            sop_uid = inst.get('sopInstanceUid')
            if not sop_uid:
                return None
            file_path = os.path.join(cache_dir, f"{sop_uid}.dcm")
            if not os.path.exists(file_path) or os.path.getsize(file_path) == 0:
                try:
                    file_url = f"{base_pacs_url}/api/instances/{sop_uid}/file"
                    with urllib.request.urlopen(file_url, timeout=30.0) as resp:
                        content = resp.read()
                        with open(file_path, "wb") as f_out:
                            f_out.write(content)
                except Exception as e:
                    print(f"[MPR] Error downloading instance {sop_uid}: {e}")
                    return None
            return file_path

        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(_download_instance, instances))

        return [r for r in results if r]

    def _find_series_files(self, study_uid: str, series_uid: str) -> List[str]:
        """Locates all .dcm files corresponding to a study and series UID, auto-promoting to volumetric series if a 1-slice scout is passed"""
        found_files = []
        
        # 1. Search for specified series_uid across local candidate paths
        if series_uid:
            for base in self.candidate_paths:
                if not os.path.exists(base):
                    continue
                direct = os.path.join(base, study_uid, series_uid)
                if os.path.exists(direct):
                    files = [os.path.join(direct, f) for f in os.listdir(direct) if f.endswith('.dcm') or f.endswith('.DCM')]
                    if len(files) > 1:
                        return files
                    if len(files) == 1 and not found_files:
                        found_files = files

        # 2. If series_uid has <= 1 slice or was not found, inspect study directory for volumetric series (> 1 slice)
        for base in self.candidate_paths:
            if not os.path.exists(base):
                continue
            study_dir = os.path.join(base, study_uid)
            if os.path.exists(study_dir):
                candidate_series = []
                for d in os.listdir(study_dir):
                    sub = os.path.join(study_dir, d)
                    if os.path.isdir(sub):
                        dcm_files = [os.path.join(sub, f) for f in os.listdir(sub) if f.endswith('.dcm') or f.endswith('.DCM')]
                        if dcm_files:
                            candidate_series.append((len(dcm_files), dcm_files))
                
                # Pick the series with the most slices (the true 3D volume, e.g. 250 slices)
                if candidate_series:
                    candidate_series.sort(key=lambda x: x[0], reverse=True)
                    if candidate_series[0][0] > 1:
                        return candidate_series[0][1]

        if found_files and len(found_files) > 1:
            return found_files

        # 3. Fallback to PACS API over HTTP if local disk paths did not contain the instances
        pacs_files = self._fetch_from_pacs_api(study_uid, series_uid)
        if pacs_files:
            return pacs_files

        return found_files

    def load_volume(self, study_uid: str, series_uid: str) -> Dict[str, Any]:
        """Loads and caches a 3D NumPy array for a given series"""
        # Check cache by series_uid or study_uid
        cache_key = f"{study_uid}:{series_uid}"
        if cache_key in self.volume_cache:
            return self.volume_cache[cache_key]
        if series_uid in self.volume_cache:
            return self.volume_cache[series_uid]

        files = self._find_series_files(study_uid, series_uid)
        if not files:
            raise HTTPException(status_code=404, detail=f"No DICOM instances found for study={study_uid} series={series_uid}")

        slices = []
        dz, dy, dx = 2.0, 0.65, 0.65
        default_wc, default_ww = 40.0, 400.0
        patient_name = "Anonymous"
        patient_id = "Unknown"
        modality = "CT"
        actual_series_uid = series_uid

        for f in files:
            try:
                path_to_open = f
                if os.name == 'nt' and not f.startswith('\\\\?\\'):
                    path_to_open = '\\\\?\\' + os.path.abspath(f)
                
                ds = pydicom.dcmread(path_to_open)
                
                if hasattr(ds, 'ImagePositionPatient') and len(ds.ImagePositionPatient) >= 3:
                    z = float(ds.ImagePositionPatient[2])
                elif hasattr(ds, 'SliceLocation'):
                    z = float(ds.SliceLocation)
                else:
                    z = float(getattr(ds, 'InstanceNumber', 0))

                slope = float(getattr(ds, 'RescaleSlope', 1.0))
                intercept = float(getattr(ds, 'RescaleIntercept', 0.0))
                
                hu = (ds.pixel_array.astype(np.float32) * slope + intercept).astype(np.int16)
                slices.append((z, hu))

                if len(slices) == 1:
                    if hasattr(ds, 'SeriesInstanceUID'):
                        actual_series_uid = str(ds.SeriesInstanceUID)
                    if hasattr(ds, 'WindowCenter'):
                        val = ds.WindowCenter
                        default_wc = float(val[0]) if isinstance(val, (list, pydicom.multival.MultiValue)) else float(val)
                    if hasattr(ds, 'WindowWidth'):
                        val = ds.WindowWidth
                        default_ww = float(val[0]) if isinstance(val, (list, pydicom.multival.MultiValue)) else float(val)
                    if hasattr(ds, 'PixelSpacing') and len(ds.PixelSpacing) >= 2:
                        dy, dx = float(ds.PixelSpacing[0]), float(ds.PixelSpacing[1])
                    if hasattr(ds, 'SliceThickness'):
                        dz = float(ds.SliceThickness)
                    if hasattr(ds, 'PatientName'):
                        patient_name = str(ds.PatientName)
                    if hasattr(ds, 'PatientID'):
                        patient_id = str(ds.PatientID)
                    if hasattr(ds, 'Modality'):
                        modality = str(ds.Modality)
            except Exception as e:
                print(f"[MPR] Error reading slice {f}: {e}")
                continue

        if not slices:
            raise HTTPException(status_code=500, detail="Failed to parse DICOM slices into volume")

        # Sort along Z-axis (Inferior -> Superior)
        slices.sort(key=lambda s: s[0])
        volume = np.stack([s[1] for s in slices])

        cached_entry = {
            "volume": volume,
            "dz": dz,
            "dy": dy,
            "dx": dx,
            "wc": default_wc,
            "ww": default_ww,
            "patient_name": patient_name,
            "patient_id": patient_id,
            "modality": modality,
            "actual_series_uid": actual_series_uid,
            "slices_count": volume.shape[0],
            "rows_count": volume.shape[1],
            "cols_count": volume.shape[2]
        }
        self.volume_cache[cache_key] = cached_entry
        self.volume_cache[actual_series_uid] = cached_entry
        self.volume_cache[series_uid] = cached_entry
        return cached_entry

    def get_volume_info(self, study_uid: str, series_uid: str) -> Dict[str, Any]:
        """Returns metadata, dimensions, and default windowing for the volume"""
        entry = self.load_volume(study_uid, series_uid)
        return {
            "status": "ready",
            "studyUid": study_uid,
            "seriesUid": entry.get("actual_series_uid", series_uid),
            "patientName": entry["patient_name"],
            "patientId": entry["patient_id"],
            "modality": entry["modality"],
            "dimensions": {
                "axial": entry["slices_count"],
                "coronal": entry["rows_count"],
                "sagittal": entry["cols_count"]
            },
            "spacing": [entry["dz"], entry["dy"], entry["dx"]],
            "windowCenter": entry["wc"],
            "windowWidth": entry["ww"]
        }

    def get_orthogonal_slice(
        self,
        study_uid: str,
        series_uid: str,
        plane: str,
        slice_idx: int,
        wc: Optional[float] = None,
        ww: Optional[float] = None,
        out_size: int = 512
    ) -> Response:
        """Dynamically reconstructs orthogonal Axial, Coronal, or Sagittal slices from volume"""
        try:
            entry = self.load_volume(study_uid, series_uid)
        except Exception:
            return self._fallback_synthetic_slice(plane, slice_idx)

        vol = entry["volume"] # Shape: (Z, Y, X)
        num_slices, rows, cols = vol.shape
        dz, dy, dx = entry["dz"], entry["dy"], entry["dx"]
        
        cur_wc = float(wc) if wc is not None else entry["wc"]
        cur_ww = float(ww) if ww is not None else entry["ww"]
        if cur_ww <= 0:
            cur_ww = 1.0

        plane = plane.lower()

        if plane == "coronal":
            y = max(0, min(slice_idx, rows - 1))
            raw_slice = vol[::-1, y, :] # Flip Z so superior is at top
            phys_h = num_slices * dz
            phys_w = cols * dx
        elif plane == "sagittal":
            x = max(0, min(slice_idx, cols - 1))
            raw_slice = vol[::-1, :, x] # Flip Z so superior is at top
            phys_h = num_slices * dz
            phys_w = rows * dy
        else:
            z = max(0, min(slice_idx, num_slices - 1))
            raw_slice = vol[z, :, :]
            phys_h = rows * dy
            phys_w = cols * dx

        min_hu = cur_wc - (cur_ww / 2.0)
        lut = np.clip((raw_slice.astype(np.float32) - min_hu) / cur_ww * 255.0, 0, 255).astype(np.uint8)

        aspect = phys_h / phys_w if phys_w > 0 else 1.0
        target_w = out_size
        target_h = int(out_size * aspect)
        
        img = Image.fromarray(lut).resize((target_w, target_h), Image.Resampling.BILINEAR)

        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=92)
        return Response(content=buf.getvalue(), media_type="image/jpeg", headers=STANDARD_HEADERS)

    def _fallback_synthetic_slice(self, plane: str, slice_idx: int) -> Response:
        """Safe synthetic fallback if files are completely missing"""
        img = Image.new('L', (512, 512), color=15)
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=85)
        return Response(content=buf.getvalue(), media_type="image/jpeg", headers=STANDARD_HEADERS)

reconstruction_service = ReconstructionService()
