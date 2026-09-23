from fastapi import APIRouter
from app.services.annotation_service import annotation_service

router = APIRouter(prefix="/annotations", tags=["Annotations"])

@router.post("")
async def create_annotation(data: dict):
    """Saves a text/arrow viewport annotation"""
    return annotation_service.save_annotation(data)

@router.get("/{study_uid}")
async def get_annotations(study_uid: str):
    """Retrieves all annotations under a study UID"""
    return annotation_service.get_annotations_by_study(study_uid)

@router.put("/{id}")
async def update_annotation(id: str, data: dict):
    """Updates properties of an annotation entry"""
    return annotation_service.update_annotation(id, data)

@router.delete("/{id}")
async def delete_annotation(id: str):
    """Removes an annotation by ID"""
    return annotation_service.delete_annotation(id)
