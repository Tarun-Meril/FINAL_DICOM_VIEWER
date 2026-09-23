from typing import List, Dict, Any
from app.dicom.dicomweb_client import DicomWebClient

class InstanceService:
    def __init__(self):
        self.client = DicomWebClient()

    async def get_instances_for_series(self, series_uid: str) -> List[Dict[str, Any]]:
        # Simulates loading SOP instances from the PACS repository
        return [
            {
                "sop_instance_uid": f"{series_uid}.1.{i}",
                "series_instance_uid": series_uid,
                "study_instance_uid": "1.2.276.0.7230010.3.1.2.2155604110.4180.1021041295.1",
                "instance_number": i,
                "file_size": 524288
            } for i in range(1, 184)
        ]

    async def get_instance_details(self, instance_uid: str) -> Dict[str, Any]:
        return {
            "sop_instance_uid": instance_uid,
            "series_instance_uid": "1.2.276.0.7230010.3.1.2.2155604110.4180.1021041295.1.2",
            "study_instance_uid": "1.2.276.0.7230010.3.1.2.2155604110.4180.1021041295.1",
            "instance_number": 1,
            "file_size": 524288
        }

instance_service = InstanceService()
