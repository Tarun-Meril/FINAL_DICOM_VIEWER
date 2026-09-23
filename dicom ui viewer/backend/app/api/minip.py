from fastapi import APIRouter
from app.services.minip_service import minip_service

router = APIRouter(prefix="/minip", tags=["Minimum Intensity Projection"])

@router.post("")
async def create_minip(data: dict):
    """Generates a Minimum Intensity Projection slice with custom slab thickness"""
    study_uid = data.get("study_uid")
    series_uid = data.get("series_uid")
    thickness = data.get("thickness", 10)
    return minip_service.project_minimum(study_uid, series_uid, thickness)
