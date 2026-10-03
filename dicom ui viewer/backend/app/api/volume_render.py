from fastapi import APIRouter, Query
from app.services.volume_rendering_service import volume_rendering_service
from app.services.preset_service import preset_service

router = APIRouter(tags=["Volume Rendering & Presets"])

@router.get("/volume-render")
async def get_volume_render(
    study_uid: str = Query(...),
    series_uid: str = Query(""),
    yaw: float = Query(0.0),
    pitch: float = Query(0.0),
    preset: str = Query("bone"),
    zoom: float = Query(1.0),
    quality: str = Query("standard"),
    out_size: int = Query(512)
):
    """Generates a 3D volumetric projection image frame with custom camera viewing angles"""
    return volume_rendering_service.render_volume(
        study_uid=study_uid,
        series_uid=series_uid,
        yaw=yaw,
        pitch=pitch,
        preset=preset,
        zoom=zoom,
        quality=quality,
        out_size=out_size
    )

@router.post("/volume-render")
async def create_volume_render(data: dict):
    """Generates a 3D volumetric projection image frame"""
    study_uid = data.get("study_uid", "")
    series_uid = data.get("series_uid", "")
    yaw = float(data.get("yaw", 0.0))
    pitch = float(data.get("pitch", 0.0))
    preset = data.get("preset", "bone")
    zoom = float(data.get("zoom", 1.0))
    quality = data.get("quality", "standard")
    out_size = int(data.get("out_size", 512))
    return volume_rendering_service.render_volume(
        study_uid=study_uid,
        series_uid=series_uid,
        yaw=yaw,
        pitch=pitch,
        preset=preset,
        zoom=zoom,
        quality=quality,
        out_size=out_size
    )

@router.get("/render-presets")
async def get_render_presets():
    """Retrieve catalog of standard voxel color/opacity transfer presets"""
    return preset_service.list_presets()

@router.post("/render-presets")
async def save_render_presets(data: dict):
    """Saves a custom voxel transfer preset configuration"""
    return preset_service.save_preset(data)
