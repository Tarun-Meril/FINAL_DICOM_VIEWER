from fastapi import APIRouter
from app.services.hl7_service import hl7_service

router = APIRouter(prefix="/hl7", tags=["HL7 Interoperability"])

@router.post("")
async def receive_or_send_hl7(data: dict):
    """Sends observations data packets mapping ORU hl7 metrics"""
    study_uid = data.get("study_instance_uid")
    text = data.get("text", "")
    return hl7_service.send_observation_report(study_uid, text)
