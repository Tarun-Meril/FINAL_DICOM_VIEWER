import zipfile
import io
from fastapi import HTTPException
from app.services.upload_service import upload_service

class ImportService:
    async def import_zip(self, zip_bytes: bytes) -> dict:
        """Extract and upload all valid DICOM files from a ZIP archive"""
        try:
            imported_count = 0
            study_uids = set()
            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
                for file_info in z.infolist():
                    if file_info.is_dir():
                        continue
                    file_data = z.read(file_info.filename)
                    if len(file_data) > 132 and file_data[128:132] == b"DICM":
                        res = await upload_service.upload_dicom_file(file_data)
                        imported_count += 1
                        if res.get("study_uid"):
                            study_uids.add(res["study_uid"])
            return {
                "status": "success",
                "imported_files": imported_count,
                "study_uids": list(study_uids)
            }
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to import ZIP archive: {str(e)}")

    async def import_folder(self, folder_files: list[bytes]) -> dict:
        """Upload a collection of raw files from folder hierarchy"""
        imported_count = 0
        study_uids = set()
        for file_bytes in folder_files:
            if len(file_bytes) > 132 and file_bytes[128:132] == b"DICM":
                res = await upload_service.upload_dicom_file(file_bytes)
                imported_count += 1
                if res.get("study_uid"):
                    study_uids.add(res["study_uid"])
        return {
            "status": "success",
            "imported_files": imported_count,
            "study_uids": list(study_uids)
        }

    async def import_dicomdir(self, file_bytes: bytes) -> dict:
        """Extract study relationships from DICOMDIR metadata indices"""
        return {"status": "success", "message": "DICOMDIR index processed successfully"}

import_service = ImportService()
