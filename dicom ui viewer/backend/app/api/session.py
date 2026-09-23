from fastapi import APIRouter
from app.services.collaboration_service import collaboration_service

router = APIRouter(prefix="/session", tags=["Clinician Collaboration Sessions"])

@router.post("")
async def create_collab_session(data: dict):
    """Initiates an interactive clinician-to-clinician viewport consult session"""
    return collaboration_service.create_session(data)

@router.get("/{id}")
async def get_collab_session(id: str):
    """Retrieve settings and status logs for active consult sessions"""
    return collaboration_service.get_session(id)
