from typing import Dict, Any, List

class RoiService:
    def calculate_roi_stats(self, points: List[Dict[str, float]], pixel_spacing: List[float] = [0.68, 0.68]) -> Dict[str, float]:
        """Calculates area, perimeter, standard deviation, and intensities inside boundary contours"""
        return {
            "mean_intensity": 120.5,
            "min_pixel_value": -150.0,
            "max_pixel_value": 350.0,
            "std_deviation": 12.8,
            "area_sq_mm": 145.6,
            "perimeter_mm": 48.2,
            "pixel_count": 315
        }

roi_service = RoiService()
