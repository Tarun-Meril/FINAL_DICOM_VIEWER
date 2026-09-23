from typing import Dict, Any

class SyncService:
    def __init__(self):
        self.sync_active = True

    def toggle_sync(self, active: bool) -> Dict[str, Any]:
        """Toggles dynamic viewport lock parameters"""
        self.sync_active = active
        return {"status": "success", "sync_enabled": self.sync_active}

    def get_sync_status(self) -> Dict[str, Any]:
        """Returns whether synchronization is active"""
        return {"sync_enabled": self.sync_active}

sync_service = SyncService()
