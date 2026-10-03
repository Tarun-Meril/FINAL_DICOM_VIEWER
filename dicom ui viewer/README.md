# MerilView Diagnostic Workstation - Environment & Deployment Guide

This guide describes how to configure, run, and deploy the MerilView Diagnostic Workstation.

MerilView consists of a high-performance React 19 / CornerstoneJS frontend shell, a FastAPI gateway backend service, a PostgreSQL relational store, a Redis task broker/cache layer, Celery background queues, and an Orthanc PACS server.

---

## 📂 Subsystem Structure

```
dicom ui viewer/
├── frontend/             # React 19 + CornerstoneJS 4.x + Vite + Electron UI
│   ├── src/              # Diagnostic viewport, clinical tools, sidebars, MPR/VR
│   ├── electron/         # Desktop application shell & frameless window manager
│   ├── nginx.conf        # Production Nginx configuration (COOP/COEP isolation & SPA routing)
│   ├── Dockerfile        # Production multi-stage build container
│   ├── .env              # Loaded configurations (Vite)
│   └── package.json      # Dependencies and execution scripts
│
├── backend/              # FastAPI Python 3.12+ backend gateway service
│   ├── app/              # FastAPI routes, database connection, and Celery workers
│   │   ├── api/          # REST endpoints (auth, studies, measurements, AI)
│   │   ├── config/       # Pydantic environment configurations
│   │   ├── database/     # SQLAlchemy session bootstraps
│   │   ├── worker.py     # Celery tasks & scheduled beat definitions
│   │   └── main.py       # Lifespan startup check logic & health endpoints
│   ├── migrations/       # Alembic database migration scripts
│   ├── .env              # Loaded configurations (Pydantic settings)
│   ├── Dockerfile        # Backend server container (Python 3.12-slim)
│   ├── start.sh          # Container startup runner (Alembic + Celery + Uvicorn)
│   └── requirements.txt  # Python requirements definition
│
├── docker-compose.yml    # Development composition profile
├── docker-compose.dev.yml# Local dev-specific overrides (volume mappings & Orthanc)
└── docker-compose.prod.yml# Production multi-stage composition profile
```

---

## ⚙️ Environment Variables Guide

### 🔌 Backend Configuration (`backend/.env`)

Generate a `.env` file in the `backend/` folder (or copy `.env.development`):

| Variable Name | Default Value | Description |
| :--- | :--- | :--- |
| `APP_NAME` | `MerilView Backend` | Display name of the API gateway. |
| `DEBUG` | `true` | Enables FastAPI auto-reload and verbose logging. |
| `SECRET_KEY` | `change-me-in-production` | Secret key for generating JWT authentication tokens. |
| `DATABASE_URL` | *None* | Override PostgreSQL connection string (takes precedence). |
| `DATABASE_HOST` | `localhost` | PostgreSQL server hostname (`db-postgres` inside Docker). |
| `DATABASE_PORT` | `5432` | PostgreSQL server port. |
| `DATABASE_USER` | `postgres` | PostgreSQL connection username. |
| `DATABASE_PASSWORD` | `postgres` | PostgreSQL connection password. |
| `DATABASE_DB` | `medview_pro` | PostgreSQL target database name. |
| `REDIS_URL` | *None* | Override Redis connection string. |
| `REDIS_HOST` | `localhost` | Redis server hostname (`cache-redis` inside Docker). |
| `REDIS_PORT` | `6379` | Redis server port. |
| `CELERY_BROKER_URL` | `redis://localhost:6379/1` | Redis queue broker address. |
| `CELERY_RESULT_BACKEND`| `redis://localhost:6379/1` | Redis task results backend. |
| `ORTHANC_URL` | `http://localhost:8042` | Orthanc PACS server address. |
| `ORTHANC_USERNAME` | `orthanc` | Orthanc admin username. |
| `ORTHANC_PASSWORD` | `orthanc` | Orthanc admin password. |
| `ORTHANC_DICOMWEB_PATH`| `/dicom-web` | Route configuration for QIDO/WADO/STOW. |
| `DICOMWEB_URL` | `http://localhost:8042/dicom-web`| Direct URL to the DICOMweb interface. |

### 🎨 Frontend Configuration (`frontend/.env`)

Vite environment variables must be prefixed with `VITE_`:

*   `VITE_API_BASE_URL` = `http://localhost:8000` (FastAPI backend gateway URL)
*   `VITE_SHARE_API_BASE_URL` = `http://localhost:3001` (PACS backend sharing endpoint)
*   `VITE_SHARE_BASE_URL` = `http://localhost:5174` (Viewer client host)
*   `VITE_ORTHANC_URL` = `http://localhost:8042` (Orthanc PACS web endpoint)
*   `VITE_DICOMWEB_URL` = `http://localhost:8042/dicom-web` (Orthanc DICOMweb endpoint)

---

## 🛠️ Startup Workflows

### 🐳 Workflow A: Docker Development (Single Command)

With Docker Desktop installed, spin up the entire pre-configured ecosystem using Docker Compose:

```bash
docker compose up -d
```

*   **MerilView Viewer Frontend:** [http://localhost:5174](http://localhost:5174) or [http://localhost:3000](http://localhost:3000)
*   **FastAPI API Gateway:** [http://localhost:8000](http://localhost:8000) (Swagger Docs: [/docs](http://localhost:8000/docs))
*   **Orthanc PACS Explorer:** [http://localhost:8042/app/explorer.html](http://localhost:8042/app/explorer.html)
*   **PostgreSQL Database:** Bound on host port `5432`
*   **Redis Cache & Broker:** Bound on host port `6379`
*   **Celery Workers & Beat Scheduler:** Automatically running in background containers

To shut down:
```bash
docker compose down
```

---

### 💻 Workflow B: Manual Local Development

#### 1. Backend Service
```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

#### 2. Celery Worker (Optional for local testing)
```powershell
cd backend
.\venv\Scripts\Activate.ps1
celery -A app.worker worker --loglevel=info -Q default,thumbnail_queue,ai_queue,upload_queue,export_queue
```

#### 3. Frontend Web Client
```powershell
cd frontend
npm install
npm run prepare:wasm
npm run dev
```

#### 4. Electron Desktop Mode
```powershell
cd frontend
npm run dev:electron
```

---

## 📈 Diagnostics & Health Checks

Verify all dependencies are healthy via the backend health endpoint:
```bash
curl http://localhost:8000/health
```

Expected JSON response:
```json
{
  "postgres": { "connected": true, "message": "Connected" },
  "redis": { "connected": true, "message": "Connected" },
  "celery": { "connected": true, "message": "Ready" },
  "migrations": { "complete": true, "message": "Up-to-date" },
  "api": { "ready": true, "message": "Ready" }
}
```
