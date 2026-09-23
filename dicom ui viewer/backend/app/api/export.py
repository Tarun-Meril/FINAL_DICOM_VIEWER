from fastapi import APIRouter, Query
from app.services.export_service import export_service

router = APIRouter(prefix="/export", tags=["Export"])

@router.post("")
async def create_export_archive(
    study_uid: str = Query(..., description="Study Instance UID")
):
    """Initiates building and downloading a study ZIP archive"""
    return await export_service.export_as_zip(study_uid)

@router.get("/{id}")
async def get_export_file(id: str):
    """Download built export file by ID"""
    return await export_service.export_as_zip(id)
