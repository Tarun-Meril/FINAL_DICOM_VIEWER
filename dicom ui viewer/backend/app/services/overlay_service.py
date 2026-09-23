from typing import Dict, Any

class OverlayService:
    def get_overlay_coordinates(self, study_uid: str) -> Dict[str, Any]:
        """Provides dynamic coordinates maps for segmentation contours and bounding boxes"""
        return {
            "study_instance_uid": study_uid,
            "bounding_boxes": [
                {
                    "label": "Lung Nodule",
                    "confidence": 0.942,
                    "x": 75,
                    "y": 80,
                    "width": 45,
                    "height": 45
                }
            ],
            "contours": [
                {
                    "label": "Lung Segment",
                    "points": [{"x": 68, "y": 60}, {"x": 106, "y": 160}, {"x": 68, "y": 168}]
                }
            ]
        }

overlay_service = OverlayService()
