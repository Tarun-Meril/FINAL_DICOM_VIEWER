from typing import Dict, Any, List

class ModelManagerService:
    def __init__(self):
        self.models = {
            "seg_spine": {"id": "seg_spine", "name": "TotalSegmentator Spine", "version": "v2.1", "enabled": True},
            "seg_lungs": {"id": "seg_lungs", "name": "MONAI Lung Segmentation", "version": "v1.4", "enabled": True},
            "det_nodules": {"id": "det_nodules", "name": "nnU-Net Lung Nodule Detector", "version": "v3.0", "enabled": True}
        }

    def list_models(self) -> List[Dict[str, Any]]:
        """Returns standard AI models registered in the gateway"""
        return list(self.models.values())

    def register_model(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Registers a new AI model configurations template"""
        m_id = data.get("id", "custom")
        self.models[m_id] = data
        return data

    def update_model(self, m_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Updates properties of registered AI model"""
        if m_id in self.models:
            self.models[m_id].update(data)
        else:
            self.models[m_id] = data
        return self.models[m_id]

    def remove_model(self, m_id: str) -> dict:
        """Removes an AI model configuration from list by ID"""
        if m_id in self.models:
            del self.models[m_id]
        return {"status": "success", "id": m_id}

model_manager_service = ModelManagerService()
