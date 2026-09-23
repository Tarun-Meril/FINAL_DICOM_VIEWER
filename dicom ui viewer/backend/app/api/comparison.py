from fastapi import APIRouter
from app.services.comparison_service import comparison_service

router = APIRouter(prefix="/comparison", tags=["Comparison"])

@router.post("")
async def start_comparison(data: dict):
    """Binds active comparison layouts for current vs prior study side by side"""
    current = data.get("current_study_uid")
    prior = data.get("prior_study_uid")
    return comparison_service.create_comparison_session(current, prior)

@router.get("/{study_uid}")
async def get_comparison_history(study_uid: str):
    """Retrieve list of related prior studies for patient comparison history"""
    return comparison_service.get_comparison_history(study_uid)
