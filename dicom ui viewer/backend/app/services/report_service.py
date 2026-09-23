from typing import Dict, Any, List

class ReportService:
    def __init__(self):
        self.reports = {}

    def get_report_by_study(self, study_uid: str) -> Dict[str, Any]:
        """Fetches clinical report draft indices by Study UID"""
        return self.reports.get(study_uid, {
            "id": f"rep_{study_uid}",
            "study_instance_uid": study_uid,
            "findings": "Lungs are clear. No focal consolidation or pleural effusion is seen. No suspicious pulmonary nodules are identified.",
            "impressions": "Normal CT Chest study.",
            "status": "DRAFT",
            "version": 1
        })

    def save_report(self, study_uid: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Saves a clinical radiology structured report draft"""
        self.reports[study_uid] = data
        return data

    def delete_report(self, study_uid: str) -> dict:
        """Deletes a report draft by study UID"""
        if study_uid in self.reports:
            del self.reports[study_uid]
        return {"status": "success", "study_instance_uid": study_uid}

report_service = ReportService()
