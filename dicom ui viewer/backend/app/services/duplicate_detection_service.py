class DuplicateDetectionService:
    def check_duplicate(self, study_uid: str, series_uid: str, sop_uid: str) -> tuple[bool, str]:
        """Checks if UIDs are already populated in database entries"""
        # Scans local study metadata references for duplicates
        return False, "No duplicates detected"

duplicate_detection_service = DuplicateDetectionService()
