from typing import Dict, Any, List

class LayoutService:
    def __init__(self):
        self.layouts = {
            "1x1": {"id": "1x1", "name": "1x1 Single", "cols": 1, "rows": 1},
            "1x2": {"id": "1x2", "name": "1x2 Split", "cols": 2, "rows": 1},
            "2x2": {"id": "2x2", "name": "2x2 Quad", "cols": 2, "rows": 2},
            "3x3": {"id": "3x3", "name": "3x3 Matrix", "cols": 3, "rows": 3}
        }

    def list_layouts(self) -> List[Dict[str, Any]]:
        """Returns standard grid viewport layouts configurations"""
        return list(self.layouts.values())

    def get_layout(self, layout_id: str) -> Dict[str, Any]:
        """Fetch viewport layout configuration details by ID"""
        return self.layouts.get(layout_id, self.layouts["2x2"])

    def save_layout(self, layout_data: Dict[str, Any]) -> Dict[str, Any]:
        """Registers a custom grid viewport layout"""
        l_id = layout_data.get("id", "custom")
        self.layouts[l_id] = layout_data
        return layout_data

    def delete_layout(self, layout_id: str) -> dict:
        """Removes layout template configuration by ID"""
        if layout_id in self.layouts:
            del self.layouts[layout_id]
        return {"status": "success", "id": layout_id}

layout_service = LayoutService()
