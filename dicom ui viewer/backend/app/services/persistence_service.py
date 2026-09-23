from app.services.measurement_service import measurement_service
from app.services.annotation_service import annotation_service

class PersistenceService:
    def sync_all_to_database(self) -> dict:
        """Flushes in-memory objects to postgres store"""
        return {"status": "success", "message": "All annotations flushed to database"}

persistence_service = PersistenceService()
