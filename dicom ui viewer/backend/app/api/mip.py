from fastapi import APIRouter
from app.services.mip_service import mip_service

router = APIRouter(prefix="/mip", tags=["Maximum Intensity Projection"])

@router.post("")
async def create_mip(data: dict):
    """Generates a Maximum Intensity Projection slice with custom slab thickness"""
    study_uid = data.get("study_uid")
    series_uid = data.get("series_uid")
    thickness = data.get("thickness", 10)
    return mip_service.project_maximum(study_uid, series_uid, thickness)
