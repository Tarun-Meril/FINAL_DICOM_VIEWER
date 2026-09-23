from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import List
from app.services.upload_service import upload_service
from app.services.import_service import import_service

router = APIRouter(tags=["Import & Upload"])

@router.post("/upload")
async def upload_dicom_files(files: List[UploadFile] = File(...)):
    """Upload a list of raw DICOM files directly (STOW-RS)"""
    results = []
    for file in files:
        contents = await file.read()
        res = await upload_service.upload_dicom_file(contents)
        results.append(res)
    return {"status": "success", "results": results}

@router.post("/import/zip")
async def import_zip_file(file: UploadFile = File(...)):
    """Upload and extract a zip file containing DICOM studies"""
    contents = await file.read()
    return await import_service.import_zip(contents)

@router.post("/import/folder")
async def import_folder_files(files: List[UploadFile] = File(...)):
    """Recursively upload folder contents"""
    contents_list = []
    for file in files:
        contents_list.append(await file.read())
    return await import_service.import_folder(contents_list)

@router.post("/import/dicomdir")
async def import_dicomdir_file(file: UploadFile = File(...)):
    """Read study references from a DICOMDIR index"""
    contents = await file.read()
    return await import_service.import_dicomdir(contents)

@router.get("/import/status")
async def get_import_status():
    """Retrieve active background import task statistics"""
    return {"status": "idle", "progress": 100, "active_jobs": 0}
