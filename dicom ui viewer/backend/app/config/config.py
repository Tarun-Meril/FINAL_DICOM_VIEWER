from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "MedView PRO Backend"
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = "change-me-in-production"
    
    # Direct database URL override (optional)
    DATABASE_URL: str | None = None
    
    # PostgreSQL settings
    DATABASE_HOST: str = "localhost"
    DATABASE_PORT: int = 5432
    DATABASE_USER: str = "postgres"
    DATABASE_PASSWORD: str = "postgres"
    DATABASE_DB: str = "medview_pro"
    
    # Direct Redis URL override (optional)
    REDIS_URL: str | None = None
    
    # Redis settings
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    
    # Celery Task Settings
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"
    
    # PACS Study Browser backend URL (Node.js, port 3001)
    PACS_BROWSER_URL: str = "http://localhost:3001"
    
    # Direct DICOMWeb URL override (optional)
    DICOMWEB_URL: str | None = None
    
    # Storage settings
    STORAGE_PATH: str = "./storage"
    
    # Logging Level
    LOGGING_LEVEL: str = "INFO"
    
    # JWT settings
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Orthanc settings
    ORTHANC_URL: str = "http://localhost:8042"
    ORTHANC_USERNAME: str = "orthanc"
    ORTHANC_PASSWORD: str = "orthanc"
    ORTHANC_DICOMWEB_PATH: str = "/dicom-web"

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"

settings = Settings()
