import httpx
from app.config.config import settings

class DicomWebClient:
    """
    DICOMweb client — proxies to the PACS Study Browser backend (Node.js, port 3001).
    Orthanc has been removed; the PACS Study Browser serves as the DICOM data source.
    """
    def __init__(self):
        self.base_url = f"{settings.PACS_BROWSER_URL}/api"
        self.auth = None
        self._shared_client = httpx.AsyncClient(
            limits=httpx.Limits(max_keepalive_connections=50, max_connections=200),
            timeout=15.0
        )

    async def query_studies(self, filters: dict = None):
        """QIDO-RS equivalent: Query studies list from PACS browser backend"""
        response = await self._shared_client.get(
            f"{settings.PACS_BROWSER_URL}/api/studies",
            params=filters,
        )
        response.raise_for_status()
        result = response.json()
        return result.get("data", []) if isinstance(result, dict) else result

    async def query_series(self, study_uid: str, filters: dict = None):
        """QIDO-RS equivalent: Query series within a study from PACS browser backend"""
        response = await self._shared_client.get(
            f"{settings.PACS_BROWSER_URL}/api/studies/{study_uid}/series",
            params=filters,
        )
        response.raise_for_status()
        result = response.json()
        return result.get("data", []) if isinstance(result, dict) else result

    async def retrieve_study_metadata(self, study_uid: str):
        """Retrieve study metadata from PACS browser backend"""
        response = await self._shared_client.get(
            f"{settings.PACS_BROWSER_URL}/api/studies/{study_uid}",
        )
        response.raise_for_status()
        result = response.json()
        return result.get("data", result) if isinstance(result, dict) else result

    async def retrieve_instance(self, study_uid: str, series_uid: str, instance_uid: str):
        """Retrieve a DICOM instance — fetch from the PACS Study Browser backend"""
        response = await self._shared_client.get(
            f"{settings.PACS_BROWSER_URL}/api/instances/{instance_uid}/file",
        )
        response.raise_for_status()
        return response.content

    async def store_instances(self, dicom_file_bytes: bytes):
        """STOW-RS: Upload DICOM to PACS browser backend"""
        files = {"files": ("uploaded_instance.dcm", dicom_file_bytes, "application/dicom")}
        response = await self._shared_client.post(
            f"{settings.PACS_BROWSER_URL}/api/studies/upload",
            files=files,
        )
        response.raise_for_status()
        return response.json()
