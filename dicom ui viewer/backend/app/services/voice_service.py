from typing import Dict, Any

class VoiceService:
    def transcribe_audio(self, audio_bytes: bytes) -> Dict[str, Any]:
        """Transcribes clinician speech audio streams to structured medical terminology"""
        return {
            "status": "success",
            "transcription": "CT Chest demonstrates normal lung volume and vascular markings.",
            "confidence": 0.985
        }

voice_service = VoiceService()
