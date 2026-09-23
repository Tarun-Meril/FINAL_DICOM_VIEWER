from typing import Dict, Any

class CollaborationService:
    def __init__(self):
        self.sessions = {}

    def create_session(self, session_data: dict) -> Dict[str, Any]:
        """Registers a multi-radiologist consult session"""
        s_id = session_data.get("session_id", "session_99")
        self.sessions[s_id] = session_data
        return session_data

    def get_session(self, session_id: str) -> dict:
        """Fetches active consultancy logs details"""
        return self.sessions.get(session_id, {
            "session_id": session_id,
            "host_id": "rad_jane",
            "participants": ["rad_bob", "doc_alex"],
            "sync_active": True
        })

collaboration_service = CollaborationService()
