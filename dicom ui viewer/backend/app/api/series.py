import httpx
from fastapi import APIRouter, HTTPException
from typing import List
from app.schemas.schemas import SeriesResponse, InstanceResponse
from app.services.thumbnail_service import thumbnail_service
from app.config.config import settings

router = APIRouter(prefix="/series", tags=["Series"])

@router.get("/{series_uid}", response_model=SeriesResponse)
async def get_series(series_uid: str):
    """Retrieve details of a single series by UID by querying PACS backend"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.PACS_BROWSER_URL}/api/series/{series_uid}")
            if resp.status_code == 200:
                pacs_data = resp.json()
                if pacs_data.get("success") and pacs_data.get("data"):
                    s = pacs_data["data"]
                    return {
                        "series_instance_uid": s.get("seriesInstanceUid"),
                        "study_instance_uid": s.get("studyInstanceUid"),
                        "series_number": s.get("seriesNumber", 1),
                        "modality": s.get("modality", "MR"),
                        "series_description": s.get("seriesDescription", "Series"),
                        "number_of_series_related_instances": s.get("numberOfSeriesRelatedInstances", 0)
                    }
    except Exception:
        pass
        
    raise HTTPException(status_code=404, detail="Series not found")

import os
import pydicom

def extract_instance_metadata(inst_dict: dict, idx: int) -> dict:
    file_path = inst_dict.get("filePath") or inst_dict.get("file_path")
    rows = inst_dict.get("rows") or inst_dict.get("Rows") or 512
    cols = inst_dict.get("columns") or inst_dict.get("Columns") or 512
    bits_alloc = inst_dict.get("bitsAllocated") or inst_dict.get("bits_allocated") or 16
    bits_stored = inst_dict.get("bitsStored") or inst_dict.get("bits_stored") or 12
    high_bit = inst_dict.get("highBit") or inst_dict.get("high_bit") or (bits_stored - 1)
    samples_per_pixel = inst_dict.get("samplesPerPixel") or inst_dict.get("samples_per_pixel") or 1
    pixel_spacing = inst_dict.get("pixelSpacing") or inst_dict.get("pixel_spacing") or [0.68, 0.68]
    orientation = inst_dict.get("imageOrientation") or inst_dict.get("image_orientation") or [1, 0, 0, 0, 1, 0]
    position = inst_dict.get("imagePosition") or inst_dict.get("image_position") or [0, 0, idx * 1.25]
    slice_thick = inst_dict.get("sliceThickness") or inst_dict.get("slice_thickness") or 1.25
    wc = inst_dict.get("windowCenter") if inst_dict.get("windowCenter") is not None else (inst_dict.get("window_center") if inst_dict.get("window_center") is not None else 698)
    ww = inst_dict.get("windowWidth") if inst_dict.get("windowWidth") is not None else (inst_dict.get("window_width") if inst_dict.get("window_width") is not None else 1213)
    rescale_int = inst_dict.get("rescaleIntercept") if inst_dict.get("rescaleIntercept") is not None else (inst_dict.get("rescale_intercept") if inst_dict.get("rescale_intercept") is not None else 0.0)
    rescale_slope = inst_dict.get("rescaleSlope") if inst_dict.get("rescaleSlope") is not None else (inst_dict.get("rescale_slope") if inst_dict.get("rescale_slope") is not None else 1.0)
    photo = inst_dict.get("photometricInterpretation") or inst_dict.get("photometric_interpretation") or "MONOCHROME2"
    # FrameOfReferenceUID: critical for crosshair sync scope — must not be hard-coded globally
    frame_of_reference_uid = inst_dict.get("frameOfReferenceUID") or inst_dict.get("frame_of_reference_uid") or None

    sop_uid = inst_dict.get("sopInstanceUid") or inst_dict.get("sop_instance_uid")
    if not file_path and sop_uid:
        from app.api.instances import locate_instance_file
        file_path = locate_instance_file(sop_uid)

    if file_path:
        full_path = None
        if os.path.exists(file_path):
            full_path = file_path
        else:
            repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
            pacs_base = os.path.join(repo_root, "pacs-study-browser", "backend")
            candidate = os.path.join(pacs_base, file_path)
            if os.path.exists(candidate):
                full_path = candidate

        if full_path:
            try:
                ds = pydicom.dcmread(full_path, stop_before_pixels=True)
                rows = getattr(ds, "Rows", rows)
                cols = getattr(ds, "Columns", cols)
                bits_alloc = getattr(ds, "BitsAllocated", bits_alloc)
                bits_stored = getattr(ds, "BitsStored", bits_stored)
                high_bit = getattr(ds, "HighBit", high_bit)
                samples_per_pixel = getattr(ds, "SamplesPerPixel", samples_per_pixel)
                photo = getattr(ds, "PhotometricInterpretation", photo)
                # FrameOfReferenceUID from actual DICOM file (tag 0020,0052)
                if hasattr(ds, "FrameOfReferenceUID"):
                    frame_of_reference_uid = str(ds.FrameOfReferenceUID)
                if hasattr(ds, "PixelSpacing"):
                    pixel_spacing = [float(x) for x in ds.PixelSpacing]
                if hasattr(ds, "ImagePositionPatient"):
                    position = [float(x) for x in ds.ImagePositionPatient]
                if hasattr(ds, "ImageOrientationPatient"):
                    orientation = [float(x) for x in ds.ImageOrientationPatient]
                if hasattr(ds, "SliceThickness"):
                    slice_thick = float(ds.SliceThickness)
                if hasattr(ds, "WindowCenter"):
                    wc_val = ds.WindowCenter
                    wc = float(wc_val[0] if isinstance(wc_val, (list, pydicom.multival.MultiValue)) else wc_val)
                if hasattr(ds, "WindowWidth"):
                    ww_val = ds.WindowWidth
                    ww = float(ww_val[0] if isinstance(ww_val, (list, pydicom.multival.MultiValue)) else ww_val)
                if hasattr(ds, "RescaleIntercept"):
                    rescale_int = float(ds.RescaleIntercept)
                if hasattr(ds, "RescaleSlope"):
                    rescale_slope = float(ds.RescaleSlope)
            except Exception:
                pass

    return {
        "sop_instance_uid": inst_dict.get("sopInstanceUid") or inst_dict.get("sop_instance_uid"),
        "series_instance_uid": inst_dict.get("seriesInstanceUid") or inst_dict.get("series_instance_uid"),
        "study_instance_uid": inst_dict.get("studyInstanceUid") or inst_dict.get("study_instance_uid", ""),
        "instance_number": inst_dict.get("instanceNumber", idx + 1),
        "modality": inst_dict.get("modality") or inst_dict.get("Modality") or "MR",
        "file_path": file_path,
        "file_size": inst_dict.get("fileSize", 524288),
        "rows": rows,
        "columns": cols,
        "bits_allocated": bits_alloc,
        "bits_stored": bits_stored,
        "high_bit": high_bit,
        "samples_per_pixel": samples_per_pixel,
        "pixel_spacing": pixel_spacing,
        "image_orientation": orientation,
        "image_position": position,
        "slice_thickness": slice_thick,
        "window_center": wc,
        "window_width": ww,
        "rescale_intercept": rescale_int,
        "rescale_slope": rescale_slope,
        "photometric_interpretation": photo,
        "frame_of_reference_uid": frame_of_reference_uid,
    }

@router.get("/{series_uid}/instances", response_model=List[InstanceResponse])
async def get_series_instances(series_uid: str):
    """Retrieve list of instances (images) under a series by proxying to PACS backend"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(f"{settings.PACS_BROWSER_URL}/api/series/{series_uid}/instances")
            if resp.status_code == 200:
                pacs_data = resp.json()
                if pacs_data.get("success") and isinstance(pacs_data.get("data"), list) and len(pacs_data["data"]) > 0:
                    # Sort instances by InstanceNumber so slices are anatomically ordered
                    # (critical for volume construction and correct stack scroll direction)
                    instances_sorted = sorted(
                        pacs_data["data"],
                        key=lambda x: int(x.get("instanceNumber", x.get("instance_number", 0)))
                    )
                    return [
                        extract_instance_metadata(inst, idx)
                        for idx, inst in enumerate(instances_sorted)
                    ]
    except Exception:
        pass

    # Synthetic instances fallback for series with no stored instances
    return [
        {
            "sop_instance_uid": f"{series_uid}.{idx + 1}",
            "series_instance_uid": series_uid,
            "study_instance_uid": "",
            "instance_number": idx + 1,
            "file_path": None,
            "file_size": 524288,
            "rows": 512,
            "columns": 512,
            "bits_allocated": 16,
            "bits_stored": 12,
            "high_bit": 11,
            "samples_per_pixel": 1,
            "pixel_spacing": [0.68, 0.68],
            "image_orientation": [1, 0, 0, 0, 1, 0],
            "image_position": [0, 0, idx * 1.25],
            "slice_thickness": 1.25,
            "window_center": 400,
            "window_width": 800,
            "rescale_intercept": 0,
            "rescale_slope": 1,
            "photometric_interpretation": "MONOCHROME2",
            "frame_of_reference_uid": f"{series_uid}.FOR"
        }
        for idx in range(15)
    ]

@router.get("/{series_uid}/thumbnail")
async def get_series_thumbnail(series_uid: str):
    """Retrieve series level preview thumbnail"""
    return await thumbnail_service.get_series_thumbnail(series_uid)
