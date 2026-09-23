from fastapi import APIRouter
from app.services.cpr_service import cpr_service

router = APIRouter(prefix="/cpr", tags=["Curved Planar Reconstruction"])

@router.post("")
async def create_cpr(data: dict):
    """Generates curved planar projections along manually plotted centerlines"""
    study_uid = data.get("study_uid")
    series_uid = data.get("series_uid")
    points = data.get("points", [])
    return cpr_service.reconstruct_curved(study_uid, series_uid, points)
