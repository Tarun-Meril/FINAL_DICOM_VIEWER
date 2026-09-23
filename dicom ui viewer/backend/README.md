# MedView PRO DICOM Viewer - Backend API Service

This is the dedicated backend service for the **MedView PRO Diagnostic Workstation**. It is built using Python 3.12+ and FastAPI, designed using Clean Architecture principles, and decouples the viewer frontend from the database and PACS archive servers.

---

## Architecture & Directory Layout

```
backend/
├── app/
│   ├── api/          # Route handlers (auth, studies, measurements, mpr, ai, export)
│   ├── auth/         # JWT authentication & password hashing
│   ├── config/       # Pydantic global configuration settings (.env)
│   ├── database/     # SQLAlchemy connection engine and session factory
│   ├── dicom/        # DICOMweb standard integration (QIDO-RS, WADO-RS, STOW-RS)
│   ├── models/       # SQLAlchemy database models (users, sessions, annotations)
│   ├── schemas/      # Pydantic validation schemas
│   ├── services/     # Business logic & storage managers
│   ├── streaming/    # Pydicom frame extraction & streaming
│   ├── main.py       # API bootstrap, CORS, and WebSocket hub
│   └── worker.py     # Celery background queue tasks & schedulers
├── migrations/       # Alembic schema migrations
├── alembic.ini       # Alembic configuration
├── check_db.py       # Database connection validation utility
├── create_db.py      # Schema table creation utility
├── Dockerfile        # Container setup (Python 3.12-slim)
├── start.sh          # Container runner script
└── requirements.txt  # Python package dependencies
```

---

## Setup & Running Locally

### 1. Requirements
* Python 3.12+
* PostgreSQL (port 5432, or use automatic SQLite fallback for local testing)
* Redis (port 6379, optional if background task queue is not used)

### 2. Virtual Environment & Dependencies
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 3. Database Migrations
```powershell
alembic upgrade head
```

### 4. Running the Development Server
Launch the Uvicorn ASGI development server:
```powershell
uvicorn app.main:app --reload --port 8000
```

### 5. Running Celery Worker (Optional for background jobs)
```powershell
celery -A app.worker worker --loglevel=info -Q default,thumbnail_queue,ai_queue,upload_queue,export_queue
```

---

## Interactive Documentation & Health Checks

* **System Health Endpoint**: [http://localhost:8000/health](http://localhost:8000/health)
* **Swagger UI Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)
* **ReDoc Interactive Documentation**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
