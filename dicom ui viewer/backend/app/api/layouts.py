from fastapi import APIRouter
from app.services.layout_service import layout_service

router = APIRouter(prefix="/layouts", tags=["Layouts"])

@router.get("")
async def get_layouts():
    """Retrieve listing of layout template configs"""
    return layout_service.list_layouts()

@router.post("")
async def create_layout(data: dict):
    """Registers a grid template configuration layout"""
    return layout_service.save_layout(data)

@router.put("/{id}")
async def update_layout(id: str, data: dict):
    """Updates properties of a layout configuration"""
    data["id"] = id
    return layout_service.save_layout(data)

@router.delete("/{id}")
async def delete_layout(id: str):
    """Deletes viewport layout by ID"""
    return layout_service.delete_layout(id)
