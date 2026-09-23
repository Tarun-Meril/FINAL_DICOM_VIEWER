from fastapi import APIRouter
from app.services.storage_service import storage_service

router = APIRouter(tags=["Storage & Cache"])

@router.get("/storage")
async def get_storage_stats():
    """Retrieve allocated storage stats"""
    return storage_service.get_storage_stats()

@router.delete("/cache")
async def clear_cache():
    """Clears system and image buffers caches"""
    return storage_service.clear_caches()
