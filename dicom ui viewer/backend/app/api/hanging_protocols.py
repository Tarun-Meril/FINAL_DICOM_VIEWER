from fastapi import APIRouter
from app.services.hanging_protocol_service import hanging_protocol_service

router = APIRouter(prefix="/hanging-protocols", tags=["Hanging Protocols"])

@router.get("")
async def get_hanging_protocols():
    """Retrieve catalog of defined hanging protocols"""
    return hanging_protocol_service.get_protocols()

@router.post("")
async def determine_protocol(data: dict):
    """Evaluates input parameters to decide best viewport configurations layout"""
    modality = data.get("modality", "CT")
    body_part = data.get("body_part", "")
    description = data.get("description", "")
    return hanging_protocol_service.determine_protocol(modality, body_part, description)
