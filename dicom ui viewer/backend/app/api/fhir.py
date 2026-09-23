from fastapi import APIRouter
from app.services.fhir_service import fhir_service

router = APIRouter(prefix="/fhir", tags=["FHIR R4 Resources"])

@router.post("")
async def query_fhir_resource(data: dict):
    """Exposes standard HL7 FHIR R4 ImagingStudy json endpoints for integration"""
    study_uid = data.get("study_instance_uid")
    return fhir_service.get_imaging_study_resource(study_uid)
