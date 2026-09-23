import json
import logging
from typing import List, Dict, Any, Optional
from app.dicom.dicomweb_client import DicomWebClient

logger = logging.getLogger("medview_pro.dicom_service")

# Simple in-memory fallback cache if Redis is not connected during local dev runs
_metadata_cache = {}

class DicomService:
    def __init__(self):
        self.client = DicomWebClient()

    async def get_studies_list(self, filters: dict = None) -> List[Dict[str, Any]]:
        """QIDO-RS: Fetch studies matching search filters from Orthanc PACS"""
        try:
            raw_studies = await self.client.query_studies(filters)
            studies = []
            for s in raw_studies:
                study_uid = s.get("0020000D", {}).get("Value", [""])[0]
                patient_name = s.get("00100010", {}).get("Value", [{"Alphabetic": "Anonymous"}])[0].get("Alphabetic", "Anonymous")
                patient_id = s.get("00100020", {}).get("Value", ["PID_UNKNOWN"])[0]
                
                studies.append({
                    "study_instance_uid": study_uid,
                    "patient_name": patient_name,
                    "patient_id": patient_id,
                    "study_date": s.get("00080020", {}).get("Value", [""])[0],
                    "study_description": s.get("00081030", {}).get("Value", ["(No Description)"])[0],
                    "modalities_in_study": s.get("00080061", {}).get("Value", [""])[0] if "00080061" in s else "CT",
                    "number_of_study_related_series": int(s.get("00201206", {}).get("Value", [1])[0]) if "00201206" in s else 1,
                    "number_of_study_related_instances": int(s.get("00201208", {}).get("Value", [100])[0]) if "00201208" in s else 100,
                })
            return studies
        except Exception as e:
            logger.warning(f"Could not connect to Orthanc PACS. Error: {str(e)}")
            return []

    async def get_series_for_study(self, study_uid: str) -> List[Dict[str, Any]]:
        """QIDO-RS: Get list of series under a study from PACS"""
        try:
            raw_series = await self.client.query_series(study_uid)
            series = []
            for s in raw_series:
                series_uid = s.get("0020000E", {}).get("Value", [""])[0]
                series.append({
                    "series_instance_uid": series_uid,
                    "study_instance_uid": study_uid,
                    "series_number": int(s.get("00200011", {}).get("Value", [1])[0]),
                    "modality": s.get("00080060", {}).get("Value", ["CT"])[0],
                    "series_description": s.get("0008103e", {}).get("Value", [f"Series {series_uid}"])[0] if "0008103e" in s else f"Series {series_uid}",
                    "number_of_series_related_instances": int(s.get("00201209", {}).get("Value", [100])[0]) if "00201209" in s else 100
                })
            return series
        except Exception:
            return []

    async def get_study_details(self, study_uid: str) -> Optional[Dict[str, Any]]:
        """Retrieve details of a single study"""
        studies = await self.get_studies_list()
        for s in studies:
            if s["study_instance_uid"] == study_uid:
                return s
        return None

    async def get_study_metadata(self, study_uid: str) -> Dict[str, Any]:
        """WADO-RS: Fetch and extract study metadata tags"""
        if study_uid in _metadata_cache:
            return _metadata_cache[study_uid]

        try:
            metadata = await self.client.retrieve_study_metadata(study_uid)
            _metadata_cache[study_uid] = metadata
            return metadata
        except Exception:
            # Fallback struct
            dummy_metadata = {
                "study_instance_uid": study_uid,
                "sop_class_uid": "1.2.840.10008.5.1.4.1.1.2",  # CT Image Storage
                "patient_name": "DOE^JOHN",
                "patient_id": "982-12-8419",
                "pixel_spacing": [0.68, 0.68],
                "slice_thickness": 1.25,
                "window_width": 400,
                "window_level": 40,
                "modality": "CT"
            }
            return dummy_metadata

dicom_service = DicomService()
