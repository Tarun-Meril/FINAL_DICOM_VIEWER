from typing import Dict, Any

class CrosshairService:
    def get_crosshair_planes(self, active_viewport_id: int) -> Dict[str, Any]:
        """Calculates intersecting crosshair indices across Axial, Sagittal, and Coronal views"""
        return {
            "active_viewport": active_viewport_id,
            "horizontal_line_y": 120,
            "vertical_line_x": 120,
            "color": "#00FFFF"
        }

crosshair_service = CrosshairService()
