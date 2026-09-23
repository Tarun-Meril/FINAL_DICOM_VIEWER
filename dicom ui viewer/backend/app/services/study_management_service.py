class StudyManagementService:
    def __init__(self):
        self.favorites = []
        self.recents = [
            {
                "study_instance_uid": "1.2.276.0.7230010.3.1.2.2155604110.4180.1021041295.1",
                "patient_name": "Structured Reports",
                "accessed_at": "2026-07-01T12:00:00Z"
            }
        ]

    def get_favorites(self) -> list:
        """Retrieve favorites list"""
        return self.favorites

    def add_favorite(self, study_uid: str) -> dict:
        """Add a study to favorites"""
        if study_uid not in self.favorites:
            self.favorites.append(study_uid)
        return {"status": "success", "message": "Study added to favorites"}

    def remove_favorite(self, study_uid: str) -> dict:
        """Remove a study from favorites"""
        if study_uid in self.favorites:
            self.favorites.remove(study_uid)
        return {"status": "success", "message": "Study removed from favorites"}

    def get_recent_studies(self) -> list:
        """Retrieve recent studies list"""
        return self.recents

study_management_service = StudyManagementService()
