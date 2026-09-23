#!/bin/bash

# Exit immediately if any command fails, unless handled
set -e

# Run database migrations
echo "Running database migrations..."
alembic upgrade head || echo "Database migration note: proceeding with server startup..."

# When running in standalone container without separate compose services,
# START_INTERNAL_CELERY can be set to true to spawn workers alongside FastAPI.
if [ "${START_INTERNAL_CELERY:-false}" = "true" ]; then
    echo "Starting internal Celery worker..."
    celery -A app.worker worker --loglevel=info -Q default,thumbnail_queue,ai_queue,upload_queue,export_queue &

    echo "Starting internal Celery beat..."
    celery -A app.worker beat --loglevel=info &
fi

# Start FastAPI application in the foreground
echo "Starting FastAPI application on port 8000..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000

