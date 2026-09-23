from typing import Dict, Any, List

class PresetService:
    def list_presets(self) -> List[Dict[str, Any]]:
        """Returns diagnostic rendering presets catalogue"""
        return [
            {"id": "ct_bone", "name": "CT Bone", "modality": "CT"},
            {"id": "ct_lung", "name": "CT Lung", "modality": "CT"},
            {"id": "ct_soft", "name": "CT Soft Tissue", "modality": "CT"},
            {"id": "ct_abdomen", "name": "CT Abdomen", "modality": "CT"},
            {"id": "ct_brain", "name": "CT Brain", "modality": "CT"},
            {"id": "ct_angio", "name": "CT Angiography", "modality": "CT"},
            {"id": "pet_std", "name": "PET Default", "modality": "PET"},
            {"id": "mr_brain", "name": "MR Brain", "modality": "MR"},
            {"id": "mr_spine", "name": "MR Spine", "modality": "MR"}
        ]

    def save_preset(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Saves custom rendering preset mapping configs"""
        return data

preset_service = PresetService()
