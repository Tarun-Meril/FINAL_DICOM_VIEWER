class ViewportManagerService:
    def get_viewport_states(self) -> dict:
        """Returns active viewport grids parameters"""
        return {
            "viewports": [
                {"id": 1, "active": True, "series_uid": None},
                {"id": 2, "active": False, "series_uid": None},
                {"id": 3, "active": False, "series_uid": None},
                {"id": 4, "active": False, "series_uid": None}
            ]
        }

viewport_manager_service = ViewportManagerService()
