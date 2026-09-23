from fastapi import APIRouter
from app.services.sync_service import sync_service

router = APIRouter(prefix="/sync", tags=["Synchronization"])

@router.post("")
async def set_sync_status(data: dict):
    """Sets active viewport synchronization status"""
    active = data.get("active", True)
    return sync_service.toggle_sync(active)

@router.get("/status")
async def get_sync_status():
    """Retrieve active viewport synchronization status"""
    return sync_service.get_sync_status()
