from fastapi import APIRouter
from app.services.notification_service import notification_service

router = APIRouter(prefix="/notifications", tags=["System Alerts & Notifications"])

@router.get("")
async def get_notifications():
    """Retrieve list of outstanding notifications alerts"""
    return notification_service.get_unread_notifications()
