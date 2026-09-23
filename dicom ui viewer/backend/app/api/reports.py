from fastapi import APIRouter
from app.services.report_service import report_service
from app.services.pdf_service import pdf_service

router = APIRouter(tags=["Radiology Structured Reporting"])

@router.post("/reports")
async def create_report(data: dict):
    """Saves a radiology structured report draft"""
    study_uid = data.get("study_instance_uid")
    return report_service.save_report(study_uid, data)

@router.get("/reports/{study_uid}")
async def get_report(study_uid: str):
    """Retrieve radiology structured report details by Study UID"""
    return report_service.get_report_by_study(study_uid)

@router.put("/reports/{id}")
async def update_report(id: str, data: dict):
    """Updates properties of structured report draft"""
    study_uid = data.get("study_instance_uid")
    data["id"] = id
    return report_service.save_report(study_uid, data)

@router.delete("/reports/{id}")
async def delete_report(id: str):
    """Deletes structured report draft by ID"""
    study_uid = id.replace("rep_", "")
    return report_service.delete_report(study_uid)

@router.post("/pdf")
async def generate_pdf(data: dict):
    """Compiles findings and impressions, generating a downloadable PDF report"""
    study_uid = data.get("study_instance_uid")
    findings = data.get("findings", "")
    impressions = data.get("impressions", "")
    return pdf_service.generate_report_pdf(study_uid, findings, impressions)
