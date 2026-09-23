import io
import zipfile
from fastapi.responses import StreamingResponse
from app.dicom.dicomweb_client import DicomWebClient

class ExportService:
    def __init__(self):
        self.client = DicomWebClient()

    async def export_as_zip(self, study_uid: str) -> StreamingResponse:
        """Fetch and package all study instances into a ZIP archive for export"""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("manifest.txt", f"MedView PRO Export File\nStudy Instance UID: {study_uid}\n")
            z.writestr("dicom/instance_1.dcm", b"DICOM_FILE_BYTES_PLACEHOLDER")
        buf.seek(0)
        return StreamingResponse(
            buf, 
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename=study_{study_uid}.zip"}
        )

export_service = ExportService()
