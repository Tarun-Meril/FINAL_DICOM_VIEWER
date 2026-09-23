from app.services.reconstruction_service import reconstruction_service

class MprService:
    def get_slice(self, study_uid: str, series_uid: str, plane: str, slice_idx: int):
        """Retrieve orthogonal plane reconstructions"""
        return reconstruction_service.get_orthogonal_slice(study_uid, series_uid, plane, slice_idx)

mpr_service = MprService()
