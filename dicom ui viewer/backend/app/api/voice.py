from fastapi import APIRouter
from app.services.voice_service import voice_service

router = APIRouter(prefix="/voice", tags=["Speech Dictation"])

@router.post("")
async def dictate_audio(data: dict):
    """Processes audio dictation buffers to transcribe to structured findings text"""
    audio_str = data.get("audio", "")
    return voice_service.transcribe_audio(bytes(audio_str, "utf-8"))
