from typing import Optional
from fastapi import APIRouter, Query, Response
from app.services.mpr_service import mpr_service

router = APIRouter(prefix="/mpr", tags=["Multiplanar Reconstruction"])

@router.get("/info")
async def get_mpr_info(
    study_uid: str = Query(..., description="Study Instance UID"),
    series_uid: str = Query(..., description="Series Instance UID")
):
    """Retrieve volume dimensions, physical spacing, and default windowing for MPR viewports"""
    return mpr_service.get_info(study_uid, series_uid)

@router.get("/slice")
@router.get("")
async def get_mpr_slice(
    study_uid: str = Query(..., description="Study Instance UID"),
    series_uid: str = Query(..., description="Series Instance UID"),
    plane: str = Query("coronal", description="orthogonal plane: axial | coronal | sagittal"),
    slice: int = Query(0, description="0-indexed slice coordinate"),
    wc: Optional[float] = Query(None, description="Window Center"),
    ww: Optional[float] = Query(None, description="Window Width"),
    size: int = Query(512, description="Output image dimension")
):
    """Dynamically slices and renders reconstructed orthogonal slices in real-time"""
    return mpr_service.get_slice(
        study_uid=study_uid,
        series_uid=series_uid,
        plane=plane,
        slice_idx=slice,
        wc=wc,
        ww=ww,
        size=size
    )

@router.post("")
async def generate_mpr_slice(data: dict):
    """Creates orthogonal projection views along cutting planes (POST compatibility)"""
    study_uid = data.get("study_uid") or data.get("studyUID", "")
    series_uid = data.get("series_uid") or data.get("seriesUID", "")
    plane = data.get("plane", "coronal")
    slice_idx = data.get("slice", 0)
    wc = data.get("wc")
    ww = data.get("ww")
    size = data.get("size", 512)
    return mpr_service.get_slice(study_uid, series_uid, plane, slice_idx, wc, ww, size)
