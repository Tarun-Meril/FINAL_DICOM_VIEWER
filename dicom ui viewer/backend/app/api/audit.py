from fastapi import APIRouter
from app.services.audit_service import audit_service

router = APIRouter(prefix="/audit", tags=["HIPAA Compliance Auditing"])

@router.get("")
async def get_audit_trail():
    """Retrieve database log list representing audit events list"""
    return audit_service.get_logs()
