from typing import Dict, Any

class AiStorageService:
    def __init__(self):
        self.results = {}

    def store_ai_result(self, study_uid: str, result_data: dict) -> Dict[str, Any]:
        """Saves inference results package references"""
        self.results[study_uid] = result_data
        return {"status": "success", "study_instance_uid": study_uid}

    def fetch_ai_result(self, study_uid: str) -> dict:
        """Fetches inference results log details by Study UID"""
        return self.results.get(study_uid, {
            "status": "completed",
            "model_id": "det_nodules",
            "confidence": 0.942,
            "study_instance_uid": study_uid
        })

ai_storage_service = AiStorageService()
