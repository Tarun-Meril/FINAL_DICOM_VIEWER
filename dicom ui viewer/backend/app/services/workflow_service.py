from typing import Dict, Any

class WorkflowService:
    def get_worklist(self) -> list:
        """Returns active RIS study queue listing"""
        return [
            {
                "accession_number": "ACC-9988",
                "patient_name": "DOE^JOHN",
                "modality": "CT",
                "status": "UNREAD"
            }
        ]

    def lock_study(self, study_uid: str, radiologist_id: str) -> Dict[str, Any]:
        """Locks study records to prevent concurrent reading conflicts"""
        return {
            "status": "locked",
            "study_instance_uid": study_uid,
            "locked_by": radiologist_id
        }

workflow_service = WorkflowService()
