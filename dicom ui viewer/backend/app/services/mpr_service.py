from typing import Optional, Dict, Any
from fastapi import Response
from app.services.reconstruction_service import reconstruction_service

class MprService:
    def get_slice(
        self,
        study_uid: str,
        series_uid: str,
        plane: str,
        slice_idx: int,
        wc: Optional[float] = None,
        ww: Optional[float] = None,
        size: int = 512
    ) -> Response:
        """Retrieve orthogonal plane reconstructions with windowing and scaling"""
        return reconstruction_service.get_orthogonal_slice(study_uid, series_uid, plane, slice_idx, wc, ww, size)

    def get_info(self, study_uid: str, series_uid: str) -> Dict[str, Any]:
        """Retrieve volume dimensions, orientation, and windowing info"""
        return reconstruction_service.get_volume_info(study_uid, series_uid)

mpr_service = MprService()
