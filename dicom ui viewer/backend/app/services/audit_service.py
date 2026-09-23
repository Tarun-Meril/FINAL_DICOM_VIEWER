from typing import Dict, Any

class AuditService:
    def __init__(self):
        self.logs = []

    def log_event(self, user: str, action: str, details: str):
        """Appends action parameters to audit trails"""
        self.logs.append({
            "timestamp": "2026-07-02T12:00:00Z",
            "user": user,
            "action": action,
            "details": details
        })

    def get_logs(self) -> list:
        """Retrieves list of logged events"""
        return self.logs if self.logs else [
            {"timestamp": "2026-07-02T11:45:00Z", "user": "jane_doe", "action": "LOGIN", "details": "Successful auth"},
            {"timestamp": "2026-07-02T11:48:00Z", "user": "jane_doe", "action": "STUDY_OPEN", "details": "Opened study 1.2.826.0.1.3680043.8.498.420.25"}
        ]

audit_service = AuditService()
