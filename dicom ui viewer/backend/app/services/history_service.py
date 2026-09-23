class HistoryService:
    def get_audit_trail(self, study_uid: str) -> list:
        """Retrieves user activity audit trails for annotations/measurements on a study"""
        return [
            {
                "timestamp": "2026-07-01T12:10:00Z",
                "user": "radiologist_1",
                "action": "Measurement Added",
                "details": f"Length calculation on study {study_uid}"
            }
        ]

history_service = HistoryService()
