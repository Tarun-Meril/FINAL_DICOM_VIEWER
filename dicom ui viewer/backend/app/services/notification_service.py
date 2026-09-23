class NotificationService:
    def get_unread_notifications(self) -> list:
        """Retrieve unread alert queues for PACS status and AI calculations completion events"""
        return [
            {"id": "notif_1", "type": "AI_COMPLETE", "message": "AI analysis complete for Patient DOE^JOHN"},
            {"id": "notif_2", "type": "STUDY_READY", "message": "New CT Chest study received and parsed"}
        ]

notification_service = NotificationService()
