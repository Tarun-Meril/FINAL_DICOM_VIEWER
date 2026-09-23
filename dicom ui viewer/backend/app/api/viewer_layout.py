from fastapi import APIRouter
from app.services.viewer_state_service import viewer_state_service

router = APIRouter(prefix="/viewer/layout", tags=["Viewer Layout State"])

@router.get("")
async def get_viewer_layout():
    """Retrieve active viewer layout presentation state"""
    state = viewer_state_service.get_state()
    return {"layout": state.get("layout", "2x2 Quad")}

@router.post("")
async def save_viewer_layout(data: dict):
    """Saves active viewer layout presentation state"""
    layout = data.get("layout", "2x2 Quad")
    state = viewer_state_service.save_state({"layout": layout})
    return {"status": "success", "layout": state.get("layout")}
