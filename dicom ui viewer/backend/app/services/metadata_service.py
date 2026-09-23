from app.services.dicom_service import dicom_service

class MetadataService:
    async def get_study_metadata(self, study_uid: str) -> dict:
        """Retrieves and compiles extracted tags list from DICOM files"""
        return await dicom_service.get_study_metadata(study_uid)

metadata_service = MetadataService()
