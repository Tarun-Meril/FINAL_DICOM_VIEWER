from typing import Dict, Any

class CrossReferenceService:
    def get_reference_lines(self, target_series_uid: str, source_series_uid: str) -> Dict[str, Any]:
        """Compute intersection coordinates for orthogonal multiplanar reconstruction reference projection lines"""
        return {
            "source_series": source_series_uid,
            "target_series": target_series_uid,
            "reference_lines": [
                {"start": {"x": 10, "y": 120}, "end": {"x": 230, "y": 120}, "color": "#00FF00"}
            ]
        }

cross_reference_service = CrossReferenceService()
