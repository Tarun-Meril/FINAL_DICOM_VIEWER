from fastapi import APIRouter
from app.services.viewer_state_service import viewer_state_service

router = APIRouter(prefix="/viewer/state", tags=["Viewer State"])

@router.get("")
async def get_viewer_state():
    """Retrieve viewport grid presentations states"""
    return viewer_state_service.get_state()

@router.post("")
async def save_viewer_state(data: dict):
    """Save viewport grid presentations states"""
    return viewer_state_service.save_state(data)
