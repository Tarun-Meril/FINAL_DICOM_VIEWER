from fastapi import APIRouter, Query
from app.services.study_management_service import study_management_service

router = APIRouter(tags=["Favorites & History"])

@router.get("/recent")
async def get_recent_studies():
    """Retrieve list of recently viewed studies"""
    return study_management_service.get_recent_studies()

@router.get("/favorites")
async def get_favorites():
    """Retrieve list of favorited studies"""
    return study_management_service.get_favorites()

@router.post("/favorites")
async def add_favorite(
    study_uid: str = Query(..., description="Study Instance UID")
):
    """Pin a study as favorite"""
    return study_management_service.add_favorite(study_uid)

@router.delete("/favorites/{study_uid}")
async def remove_favorite(study_uid: str):
    """Unpin study from favorites"""
    return study_management_service.remove_favorite(study_uid)
