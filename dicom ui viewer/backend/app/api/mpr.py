from fastapi import APIRouter, Query
from app.services.mpr_service import mpr_service

router = APIRouter(prefix="/mpr", tags=["Multiplanar Reconstruction"])

@router.get("")
async def get_mpr_slice(
    study_uid: str = Query(...),
    series_uid: str = Query(...),
    plane: str = Query("coronal"),
    slice: int = Query(63)
):
    """Retrieve reconstructed coronal/sagittal/axial slices dynamically"""
    return mpr_service.get_slice(study_uid, series_uid, plane, slice)

@router.post("")
async def generate_mpr_slice(data: dict):
    """Creates orthogonal projection views along cutting planes"""
    study_uid = data.get("study_uid")
    series_uid = data.get("series_uid")
    plane = data.get("plane", "coronal")
    slice_idx = data.get("slice", 63)
    return mpr_service.get_slice(study_uid, series_uid, plane, slice_idx)
