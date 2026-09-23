from fastapi import APIRouter
from app.services.measurement_service import measurement_service

router = APIRouter(prefix="/measurements", tags=["Measurements"])

@router.post("")
async def create_measurement(data: dict):
    """Saves a geometric viewport measurement"""
    return measurement_service.save_measurement(data)

@router.get("/{study_uid}")
async def get_measurements(study_uid: str):
    """Retrieves all geometric measurements under a study UID"""
    return measurement_service.get_measurements_by_study(study_uid)

@router.put("/{id}")
async def update_measurement(id: str, data: dict):
    """Updates properties of a measurement entry"""
    return measurement_service.update_measurement(id, data)

@router.delete("/{id}")
async def delete_measurement(id: str):
    """Removes a measurement by ID"""
    return measurement_service.delete_measurement(id)
