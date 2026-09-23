class ViewerStateService:
    def __init__(self):
        self.state = {
            "layout": "2x2 Quad",
            "active_viewport_id": 1,
            "synchronization_links": True
        }

    def get_state(self) -> dict:
        """Retrieves currently active viewer presentation states"""
        return self.state

    def save_state(self, new_state: dict) -> dict:
        """Saves presenting grid layout states"""
        self.state.update(new_state)
        return self.state

viewer_state_service = ViewerStateService()
