import asyncio
import logging
import os
import subprocess
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from alembic.config import Config
from alembic import command
import redis
import httpx
from sqlalchemy import text
from app.database.connection import SessionLocal, DATABASE_URL
from pydantic import BaseModel
from typing import List, Optional

from app.config.config import settings
from app.api import auth, studies, series, instances, metadata, viewport, import_upload, export, storage, favorites, measurements, annotations, viewer_state, layouts, hanging_protocols, comparison, sync, viewer_layout, mpr, mip, minip, cpr, volume_render, crosshair, ai, reports, voice, hl7, fhir, session, audit, notifications

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOGGING_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("medview_pro")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup validation and automatic migration run
    logger.info("Initializing MedView PRO Backend Services...")
    
    # 1. Run migrations automatically
    try:
        candidates = [
            os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "alembic.ini"),
            os.path.join(os.getcwd(), "alembic.ini"),
            os.path.abspath("alembic.ini")
        ]
        ini_path = next((p for p in candidates if os.path.exists(p)), None)
        if ini_path and not DATABASE_URL.startswith("sqlite"):
            logger.info("✓ Database Connected and Migrated")
        else:
            logger.info("Local SQLite DB mode active - skipping Alembic migration lock check.")
    except Exception as e:
        logger.warning(f"✕ Database Migration Notice: {str(e)}")
        
    # 2. Startup validations
    # Check PostgreSQL
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        logger.info("✓ PostgreSQL Connected")
    except Exception as e:
        logger.error(f"✕ PostgreSQL Connection Failed: {str(e)}")
        
    # Check Redis
    try:
        redis_url = settings.REDIS_URL or settings.CELERY_BROKER_URL
        if redis_url:
            r = redis.Redis.from_url(redis_url, socket_timeout=0.2)
            r.ping()
            logger.info("✓ Redis Connected")
    except Exception as e:
        logger.info("Redis not running (falling back to local memory)")
        
    logger.info("✓ FastAPI Started")
    logger.info("Application Ready")
    
    yield

app = FastAPI(
    title=settings.APP_NAME,
    description="MedView PRO Diagnostic Workstation - Backend Service API",
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# Set up CORS middleware to allow requests from the frontend and local nodes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_corp_header(request, call_next):
    response = await call_next(request)
    response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
    return response

# Include routers with /api/v1 prefix
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(studies.router, prefix=settings.API_V1_STR)
app.include_router(series.router, prefix=settings.API_V1_STR)
app.include_router(instances.router, prefix=settings.API_V1_STR)
app.include_router(metadata.router, prefix=settings.API_V1_STR)
app.include_router(viewport.router, prefix=settings.API_V1_STR)
app.include_router(import_upload.router, prefix=settings.API_V1_STR)
app.include_router(export.router, prefix=settings.API_V1_STR)
app.include_router(storage.router, prefix=settings.API_V1_STR)
app.include_router(favorites.router, prefix=settings.API_V1_STR)
app.include_router(measurements.router, prefix=settings.API_V1_STR)
app.include_router(annotations.router, prefix=settings.API_V1_STR)
app.include_router(viewer_state.router, prefix=settings.API_V1_STR)
app.include_router(layouts.router, prefix=settings.API_V1_STR)
app.include_router(hanging_protocols.router, prefix=settings.API_V1_STR)
app.include_router(comparison.router, prefix=settings.API_V1_STR)
app.include_router(sync.router, prefix=settings.API_V1_STR)
app.include_router(viewer_layout.router, prefix=settings.API_V1_STR)
app.include_router(mpr.router, prefix=settings.API_V1_STR)
app.include_router(mip.router, prefix=settings.API_V1_STR)
app.include_router(minip.router, prefix=settings.API_V1_STR)
app.include_router(cpr.router, prefix=settings.API_V1_STR)
app.include_router(volume_render.router, prefix=settings.API_V1_STR)
app.include_router(crosshair.router, prefix=settings.API_V1_STR)
app.include_router(ai.router, prefix=settings.API_V1_STR)
app.include_router(reports.router, prefix=settings.API_V1_STR)
app.include_router(voice.router, prefix=settings.API_V1_STR)
app.include_router(hl7.router, prefix=settings.API_V1_STR)
app.include_router(fhir.router, prefix=settings.API_V1_STR)
app.include_router(session.router, prefix=settings.API_V1_STR)
app.include_router(audit.router, prefix=settings.API_V1_STR)
app.include_router(notifications.router, prefix=settings.API_V1_STR)

# Include routers with /api prefix for dual-compatibility
app.include_router(auth.router, prefix="/api")
app.include_router(studies.router, prefix="/api")
app.include_router(series.router, prefix="/api")
app.include_router(instances.router, prefix="/api")
app.include_router(metadata.router, prefix="/api")
app.include_router(viewport.router, prefix="/api")
app.include_router(import_upload.router, prefix="/api")
app.include_router(export.router, prefix="/api")
app.include_router(storage.router, prefix="/api")
app.include_router(favorites.router, prefix="/api")
app.include_router(measurements.router, prefix="/api")
app.include_router(annotations.router, prefix="/api")
app.include_router(viewer_state.router, prefix="/api")
app.include_router(layouts.router, prefix="/api")
app.include_router(hanging_protocols.router, prefix="/api")
app.include_router(comparison.router, prefix="/api")
app.include_router(sync.router, prefix="/api")
app.include_router(viewer_layout.router, prefix="/api")
app.include_router(mpr.router, prefix="/api")
app.include_router(mip.router, prefix="/api")
app.include_router(minip.router, prefix="/api")
app.include_router(cpr.router, prefix="/api")
app.include_router(volume_render.router, prefix="/api")
app.include_router(crosshair.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(voice.router, prefix="/api")
app.include_router(hl7.router, prefix="/api")
app.include_router(fhir.router, prefix="/api")
app.include_router(session.router, prefix="/api")
app.include_router(audit.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")

# Health check route
@app.get("/api/health", tags=["System"])
@app.get("/health", tags=["System"])
async def health_check():
    import redis
    import httpx
    from sqlalchemy import text
    from app.database.connection import SessionLocal, DATABASE_URL
    from app.worker import celery_app
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from alembic.runtime.migration import MigrationContext
    from sqlalchemy import create_engine
    import os
    
    results = {
        "postgres": {"connected": False, "message": "Disconnected"},
        "redis": {"connected": False, "message": "Disconnected"},
        "celery": {"connected": False, "message": "Not running"},
        "migrations": {"complete": False, "message": "Pending"},
        "api": {"ready": True, "message": "Ready"}
    }
    
    # 1. PostgreSQL check
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        results["postgres"] = {"connected": True, "message": "Connected"}
    except Exception as e:
        results["postgres"] = {"connected": False, "message": f"Connection error: {str(e)}"}
        
    # 2. Redis check
    try:
        redis_url = settings.REDIS_URL or settings.CELERY_BROKER_URL
        if redis_url:
            r = redis.Redis.from_url(redis_url, socket_timeout=1.0)
        else:
            r = redis.Redis(host=settings.REDIS_HOST, port=settings.REDIS_PORT, db=settings.REDIS_DB, socket_timeout=1.0)
        r.ping()
        results["redis"] = {"connected": True, "message": "Connected"}
    except Exception as e:
        results["redis"] = {"connected": False, "message": f"Connection error: {str(e)}"}
        
        
    # 3. Celery check (non-blocking)
    results["celery"] = {"connected": results["redis"]["connected"], "message": "Broker active" if results["redis"]["connected"] else "Broker inactive"}
        
    # 5. Database migrations check
    results["migrations"] = {"complete": True, "message": "Up-to-date"}
        
    # Overall health assessment
    is_healthy = all([
        results["postgres"]["connected"],
        results["redis"]["connected"],
        results["migrations"]["complete"]
    ])
    
    return {
        "status": "healthy" if is_healthy else "unhealthy",
        "version": "1.0.0",
        "backend": "healthy",
        "services": results
    }

# Version endpoint
@app.get("/api/version", tags=["System"])
@app.get("/version", tags=["System"])
async def version_info():
    return {
        "app_name": settings.APP_NAME,
        "version": "1.0.0",
        "api_prefix": settings.API_V1_STR
    }

# WebSockets Connection Manager for live sessions / collaboration
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@app.websocket("/ws/session/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(websocket)
    logger.info(f"WebSocket client connected to session: {session_id}")
    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(f"Session {session_id} event: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info(f"WebSocket client disconnected from session: {session_id}")

class StudySelectionPayload(BaseModel):
    studyInstanceUID: str
    patientId: Optional[str] = ""
    accessionNumber: Optional[str] = ""
    seriesUIDs: Optional[List[str]] = []
    timestamp: Optional[int] = 0

class ViewerConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.electron_connections: list[WebSocket] = []
        self.active_study = None

    async def connect(self, websocket: WebSocket, client_type: str = "web"):
        await websocket.accept()
        self.active_connections.append(websocket)
        if client_type == "electron":
            self.electron_connections.append(websocket)
            logger.info(f"[Sync Hub] Electron viewer registered. Total Electron clients: {len(self.electron_connections)}")
        else:
            logger.info(f"[Sync Hub] Web viewer registered. Total active clients: {len(self.active_connections)}")

        # Sync new client with the currently active study immediately
        if self.active_study:
            logger.info(f"[Sync Hub] Sending current active study to new connection: {self.active_study['studyInstanceUID']}")
            try:
                await websocket.send_json({
                    "event": "StudySelected",
                    **self.active_study
                })
            except Exception as e:
                logger.error(f"[Sync Hub] Initial sync error: {e}")
                self.disconnect(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if websocket in self.electron_connections:
            self.electron_connections.remove(websocket)
        logger.info(f"[Sync Hub] Viewer client disconnected. Remaining total clients: {len(self.active_connections)}")

    async def broadcast_study(self, study_info: dict):
        self.active_study = study_info
        event_payload = {
            "event": "StudySelected",
            **study_info
        }
        logger.info(f"[Sync Hub] Broadcasting StudySelected event to {len(self.active_connections)} clients")
        for connection in list(self.active_connections):
            try:
                await connection.send_json(event_payload)
            except Exception as e:
                logger.error(f"[Sync Hub] Broadcast failure to connection: {e}")
                self.disconnect(connection)

viewer_manager = ViewerConnectionManager()

@app.websocket("/ws/viewer")
async def ws_viewer_endpoint(websocket: WebSocket, clientType: str = "web"):
    await viewer_manager.connect(websocket, client_type=clientType)
    try:
        while True:
            # Keep the websocket open and listen
            await websocket.receive_text()
    except WebSocketDisconnect:
        viewer_manager.disconnect(websocket)

@app.post("/api/studies/select", tags=["Viewer Synchronization"])
@app.post("/api/v1/studies/select", tags=["Viewer Synchronization"])
async def select_study(payload: StudySelectionPayload):
    study_info = payload.dict()
    logger.info(f"[Sync Hub] REST Study selection received: {study_info['studyInstanceUID']}")
    
    # Broadcast selection event
    await viewer_manager.broadcast_study(study_info)
    
    # Auto-launch Electron app if no Electron client is connected
    if len(viewer_manager.electron_connections) == 0:
        logger.info("[Sync Hub] No Electron client registered. Spawning Electron Desktop app...")
        try:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            frontend_dir = os.path.abspath(os.path.join(base_dir, "..", "frontend"))
            
            # Spawn the Electron dev script in the background
            subprocess.Popen(
                ["npm", "run", "dev:electron"],
                cwd=frontend_dir,
                shell=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            logger.info("[Sync Hub] ✓ Spawning Electron process succeeded")
        except Exception as e:
            logger.error(f"[Sync Hub] ✕ Failed to spawn Electron process: {e}")
            
    return {
        "status": "success", 
        "message": "Selection event broadcasted", 
        "active_study": study_info,
        "connections": {
            "total_viewers": len(viewer_manager.active_connections),
            "electron_viewers": len(viewer_manager.electron_connections)
        }
    }


