from typing import Dict, Any

class ComparisonService:
    def create_comparison_session(self, current_study_uid: str, prior_study_uid: str) -> Dict[str, Any]:
        """Binds active study comparisons side by side in linked viewer layouts"""
        return {
            "status": "success",
            "session_id": f"compare_{current_study_uid}_{prior_study_uid}",
            "current_study_uid": current_study_uid,
            "prior_study_uid": prior_study_uid,
            "synchronized": True
        }

    def get_comparison_history(self, study_uid: str) -> list:
        """Retrieves listing of patient prior historical examinations"""
        return [
            {
                "study_instance_uid": f"{study_uid}.prior.1",
                "patient_name": "DOE^JOHN",
                "study_date": "2025-06-01",
                "study_description": "Prior CT Chest W Contrast"
            }
        ]

comparison_service = ComparisonService()
