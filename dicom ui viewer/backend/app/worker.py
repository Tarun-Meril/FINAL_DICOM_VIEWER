import os
import logging
from celery import Celery

# Import settings
from app.config.config import settings

# Configure logging for celery workers
logging.basicConfig(
    level=getattr(logging, settings.LOGGING_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("medview_worker")

# Define Celery App
celery_app = Celery(
    "medview_tasks",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND
)

# Configuration updates
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_create_missing_queues=True,
)

# Route tasks to specific queues as requested
# Enable: Background Jobs, Thumbnail Generation, AI Queue, Upload Queue, Export Queue
celery_app.conf.task_routes = {
    "app.worker.generate_thumbnail": {"queue": "thumbnail_queue"},
    "app.worker.run_ai_analysis": {"queue": "ai_queue"},
    "app.worker.process_upload": {"queue": "upload_queue"},
    "app.worker.process_export": {"queue": "export_queue"},
}

@celery_app.task(name="app.worker.generate_thumbnail")
def generate_thumbnail(study_instance_uid: str):
    logger.info(f"Generating thumbnail for study: {study_instance_uid}")
    return {"status": "success", "study_instance_uid": study_instance_uid}

@celery_app.task(name="app.worker.run_ai_analysis")
def run_ai_analysis(study_instance_uid: str):
    logger.info(f"Running AI analysis for study: {study_instance_uid}")
    return {"status": "success", "study_instance_uid": study_instance_uid}

@celery_app.task(name="app.worker.process_upload")
def process_upload(study_instance_uid: str):
    logger.info(f"Processing upload for study: {study_instance_uid}")
    return {"status": "success", "study_instance_uid": study_instance_uid}

@celery_app.task(name="app.worker.process_export")
def process_export(study_instance_uid: str):
    logger.info(f"Processing export for study: {study_instance_uid}")
    return {"status": "success", "study_instance_uid": study_instance_uid}

# Celery Beat Scheduled Tasks
@celery_app.task(name="app.worker.cleanup_cache")
def cleanup_cache():
    logger.info("Executing scheduled task: Cleanup Cache")
    return {"status": "success"}

@celery_app.task(name="app.worker.monitor_health")
def monitor_health():
    logger.info("Executing scheduled task: Health Monitoring")
    return {"status": "success"}

@celery_app.task(name="app.worker.retry_failed_jobs")
def retry_failed_jobs():
    logger.info("Executing scheduled task: Retry Failed Jobs")
    return {"status": "success"}

# Configure Beat Schedule
celery_app.conf.beat_schedule = {
    "cleanup-cache-every-hour": {
        "task": "app.worker.cleanup_cache",
        "schedule": 3600.0,
    },
    "health-monitoring-every-minute": {
        "task": "app.worker.monitor_health",
        "schedule": 60.0,
    },
    "retry-failed-jobs-every-5-minutes": {
        "task": "app.worker.retry_failed_jobs",
        "schedule": 300.0,
    },
}
