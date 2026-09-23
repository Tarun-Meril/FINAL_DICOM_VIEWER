from fastapi import APIRouter, HTTPException, Query
from app.services.model_manager_service import model_manager_service
from app.services.inference_service import inference_service
from app.services.segmentation_service import segmentation_service
from app.services.detection_service import detection_service
from app.services.overlay_service import overlay_service
from app.services.ai_storage_service import ai_storage_service

router = APIRouter(prefix="/ai", tags=["AI Platform & Inference"])

# --- Model Manager Endpoints ---
@router.get("/models")
async def get_models():
    """Retrieve list of registered AI models"""
    return model_manager_service.list_models()

@router.post("/models")
async def create_model(data: dict):
    """Registers a new AI model config profile"""
    return model_manager_service.register_model(data)

@router.put("/models/{id}")
async def update_model(id: str, data: dict):
    """Updates configurations parameters for registered AI model"""
    return model_manager_service.update_model(id, data)

@router.delete("/models/{id}")
async def delete_model(id: str):
    """Removes model registration template"""
    return model_manager_service.remove_model(id)


# --- Inference Pipeline Endpoints ---
@router.post("/inference")
async def execute_inference(data: dict):
    """Triggers background AI model analysis pipeline"""
    study_uid = data.get("study_uid")
    model_id = data.get("model_id")
    if not study_uid or not model_id:
        raise HTTPException(status_code=400, detail="Missing study_uid or model_id")
    return inference_service.execute_inference(study_uid, model_id)

@router.get("/jobs")
async def get_jobs():
    """Retrieve list of background active/completed AI analysis tasks"""
    return inference_service.list_jobs()

@router.get("/results/{study_uid}")
async def get_results(study_uid: str):
    """Retrieve cached inference outputs indices by study UID"""
    return ai_storage_service.fetch_ai_result(study_uid)


# --- Segmentation & Lesions Detection Endpoints ---
@router.post("/segment")
async def segment_study(data: dict):
    """Executes automatic organ contour division segmentation"""
    study_uid = data.get("study_uid")
    target = data.get("target_organ", "lungs")
    if not study_uid:
        raise HTTPException(status_code=400, detail="Missing study_uid")
    return segmentation_service.segment_volume(study_uid, target)

@router.post("/detect")
async def detect_pathology(data: dict):
    """Runs focal lesions and abnormalities neural detection check"""
    study_uid = data.get("study_uid")
    lesion = data.get("lesion_type", "nodules")
    if not study_uid:
        raise HTTPException(status_code=400, detail="Missing study_uid")
    return detection_service.detect_lesions(study_uid, lesion)

@router.get("/overlay/{study_uid}")
async def get_overlay(study_uid: str):
    """Retrieve dynamic coordinate masks representing lung nodules and organ contours"""
    return overlay_service.get_overlay_coordinates(study_uid)
