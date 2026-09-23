from typing import Dict, Any

class FhirService:
    def get_imaging_study_resource(self, study_uid: str) -> Dict[str, Any]:
        """Exposes standard HL7 FHIR R4 ImagingStudy json resources"""
        return {
            "resourceType": "ImagingStudy",
            "id": study_uid,
            "status": "available",
            "subject": {"reference": "Patient/pat-123"},
            "started": "2026-07-02T12:00:00Z",
            "numberOfSeries": 3,
            "numberOfInstances": 183
        }

fhir_service = FhirService()
