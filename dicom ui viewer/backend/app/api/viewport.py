from fastapi import APIRouter
from app.services.viewport_service import viewport_service

router = APIRouter(prefix="/viewport", tags=["Viewport"])

@router.get("/load")
async def load_viewport():
    """Retrieve setup specifications for loading Cornerstone viewports"""
    return viewport_service.get_viewport_load_settings()
