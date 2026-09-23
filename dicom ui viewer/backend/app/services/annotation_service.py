from typing import List, Dict, Any

class AnnotationService:
    def __init__(self):
        self.db = {}

    def save_annotation(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Saves a text/arrow annotation to database cache"""
        ann_id = data.get("id")
        if not ann_id:
            return {}
        self.db[ann_id] = data
        return data

    def get_annotations_by_study(self, study_uid: str) -> List[Dict[str, Any]]:
        """Retrieves all annotations associated with study UID"""
        return [a for a in self.db.values() if a.get("study_instance_uid") == study_uid]

    def update_annotation(self, ann_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Updates properties of an existing annotation"""
        if ann_id in self.db:
            self.db[ann_id].update(data)
        else:
            self.db[ann_id] = data
        return self.db[ann_id]

    def delete_annotation(self, ann_id: str) -> Dict[str, Any]:
        """Deletes an annotation by ID"""
        if ann_id in self.db:
            del self.db[ann_id]
        return {"status": "success", "id": ann_id}

annotation_service = AnnotationService()
