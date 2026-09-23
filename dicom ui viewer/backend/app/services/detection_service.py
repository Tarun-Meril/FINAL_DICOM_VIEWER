from typing import Dict, Any

class DetectionService:
    def detect_lesions(self, study_uid: str, lesion_type: str) -> Dict[str, Any]:
        """Identifies abnormalities and drafts bounding box coordinate profiles"""
        return {
            "status": "success",
            "study_instance_uid": study_uid,
            "lesion_type": lesion_type,
            "detections": [
                {
                    "id": "det_nod_1",
                    "label": "Lung Nodule",
                    "confidence": 0.942,
                    "bounding_box": {"x": 75, "y": 80, "width": 45, "height": 45}
                }
            ]
        }

detection_service = DetectionService()
