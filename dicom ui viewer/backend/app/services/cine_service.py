from typing import Dict, Any

class CineService:
    def get_cine_settings(self) -> Dict[str, Any]:
        """Returns standard speeds and looping boundaries for cine animations"""
        return {
            "fps": 24,
            "loop": True,
            "interpolation": "linear"
        }

cine_service = CineService()
