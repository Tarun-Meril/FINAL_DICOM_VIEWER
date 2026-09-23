from typing import List, Dict, Any

class MeasurementService:
    def __init__(self):
        self.db = {}  # In-memory database cache fallback for standalone run

    def save_measurement(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Saves a measurement to database cache"""
        meas_id = data.get("id")
        if not meas_id:
            return {}
        self.db[meas_id] = data
        return data

    def get_measurements_by_study(self, study_uid: str) -> List[Dict[str, Any]]:
        """Retrieves all measurements associated with study UID"""
        return [m for m in self.db.values() if m.get("study_instance_uid") == study_uid]

    def update_measurement(self, meas_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Updates properties of an existing measurement entry"""
        if meas_id in self.db:
            self.db[meas_id].update(data)
        else:
            self.db[meas_id] = data
        return self.db[meas_id]

    def delete_measurement(self, meas_id: str) -> Dict[str, Any]:
        """Deletes a measurement by ID"""
        if meas_id in self.db:
            del self.db[meas_id]
        return {"status": "success", "id": meas_id}

measurement_service = MeasurementService()
