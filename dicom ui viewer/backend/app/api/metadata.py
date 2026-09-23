from fastapi import APIRouter, Query
from app.services.dicom_service import dicom_service

router = APIRouter(prefix="/metadata", tags=["Metadata"])

@router.get("")
async def get_metadata(
    study_uid: str = Query(..., description="Study Instance UID")
):
    """Retrieve full structured DICOM tag metadata elements for a study (WADO-RS)"""
    return await dicom_service.get_study_metadata(study_uid)
