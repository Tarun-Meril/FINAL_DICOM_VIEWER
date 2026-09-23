from typing import Dict, Any

class HeatmapService:
    def get_heatmap_density(self, study_uid: str) -> Dict[str, Any]:
        """Provides spatial density parameters representing focal pathology probability density maps"""
        return {
            "study_instance_uid": study_uid,
            "center": {"x": 80, "y": 85},
            "radius": 30,
            "max_density": 0.96,
            "gradient": ["rgba(255,0,0,0.6)", "rgba(255,255,0,0.2)"]
        }

heatmap_service = HeatmapService()
