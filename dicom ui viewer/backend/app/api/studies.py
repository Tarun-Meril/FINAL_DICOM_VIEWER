from fastapi import APIRouter, HTTPException
from typing import List, Any
import httpx
from app.schemas.schemas import StudyResponse, SeriesResponse
from app.services.dicom_service import dicom_service
from app.services.thumbnail_service import thumbnail_service
from app.config.config import settings

router = APIRouter(prefix="/studies", tags=["Studies"])

@router.get("", response_model=List[StudyResponse])
async def get_studies():
    """QIDO-RS query for study lists proxied to PACS Study Browser backend"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{settings.PACS_BROWSER_URL}/api/studies")
            if resp.status_code == 200:
                pacs_data = resp.json()
                if pacs_data.get("success") and isinstance(pacs_data.get("data"), list):
                    return [
                        {
                            "study_instance_uid": d.get("studyInstanceUid", ""),
                            "patient_name": d.get("patientName", ""),
                            "patient_id": d.get("patientId", ""),
                            "patient_birth_date": d.get("patientBirthDate", ""),
                            "patient_sex": d.get("patientSex", ""),
                            "study_date": d.get("studyDate", ""),
                            "study_time": d.get("studyTime", ""),
                            "study_description": d.get("studyDescription", ""),
                            "modalities_in_study": d.get("modalitiesInStudy", ""),
                            "number_of_study_related_series": d.get("numberOfStudyRelatedSeries", 0),
                            "number_of_study_related_instances": d.get("numberOfStudyRelatedInstances", 0),
                            "institution": d.get("institution", ""),
                            "accession_number": d.get("accessionNumber", ""),
                            "status": d.get("status", ""),
                        }
                        for d in pacs_data["data"]
                    ]
    except Exception:
        pass
    return []

@router.get("/{study_uid}")
async def get_study(study_uid: str):
    """
    Retrieve details of a single study by UID.
    Proxies to the PACS Study Browser backend (port 3001) first,
    falling back to the internal DICOM service if not found there.
    """
    # Try PACS Study Browser backend first
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{settings.PACS_BROWSER_URL}/api/studies/{study_uid}")
            if resp.status_code == 200:
                pacs_data = resp.json()
                # Map camelCase -> snake_case for MedView PRO App.tsx
                if pacs_data.get("success") and pacs_data.get("data"):
                    d = pacs_data["data"]
                    return {
                        "study_instance_uid": d.get("studyInstanceUid", study_uid),
                        "patient_name": d.get("patientName", ""),
                        "patient_id": d.get("patientId", ""),
                        "patient_birth_date": d.get("patientBirthDate", ""),
                        "patient_sex": d.get("patientSex", ""),
                        "study_date": d.get("studyDate", ""),
                        "study_time": d.get("studyTime", ""),
                        "study_description": d.get("studyDescription", ""),
                        "modalities_in_study": d.get("modalitiesInStudy", ""),
                        "number_of_study_related_series": d.get("numberOfStudyRelatedSeries", 0),
                        "number_of_study_related_instances": d.get("numberOfStudyRelatedInstances", 0),
                        "institution": d.get("institution", ""),
                        "accession_number": d.get("accessionNumber", ""),
                        "status": d.get("status", ""),
                    }
    except Exception:
        pass  # Fall through to internal service

    # Fallback: internal DICOM service
    study = await dicom_service.get_study_details(study_uid)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    return study


@router.get("/{study_uid}/series")
async def get_study_series(study_uid: str):
    """
    QIDO-RS query for series list under a study.
    Proxies to the PACS Study Browser backend (port 3001) first.
    """
    # Try PACS Study Browser backend first
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{settings.PACS_BROWSER_URL}/api/studies/{study_uid}/series")
            if resp.status_code == 200:
                pacs_data = resp.json()
                if pacs_data.get("success") and isinstance(pacs_data.get("data"), list):
                    return [
                        {
                            "series_instance_uid": s.get("seriesInstanceUid", ""),
                            "study_instance_uid": s.get("studyInstanceUid", study_uid),
                            "series_number": s.get("seriesNumber", 0),
                            "modality": s.get("modality", ""),
                            "series_description": s.get("seriesDescription", ""),
                            "number_of_series_related_instances": s.get("numberOfSeriesRelatedInstances", 0),
                        }
                        for s in pacs_data["data"]
                    ]
    except Exception:
        pass  # Fall through to internal service

    # Fallback: internal DICOM service
    return await dicom_service.get_series_for_study(study_uid)


@router.get("/{study_uid}/thumbnail")
async def get_study_thumbnail(study_uid: str):
    """Retrieve study level preview thumbnail"""
    return await thumbnail_service.get_series_thumbnail(study_uid)
