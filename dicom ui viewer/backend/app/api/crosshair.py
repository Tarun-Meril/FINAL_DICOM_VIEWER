from fastapi import APIRouter
from app.services.crosshair_service import crosshair_service

router = APIRouter(prefix="/crosshair", tags=["Crosshair & References"])

@router.post("")
async def set_crosshair(data: dict):
    """Calculates active intersection indices for plane reference crosshairs"""
    viewport_id = data.get("viewport_id", 1)
    return crosshair_service.get_crosshair_planes(viewport_id)
