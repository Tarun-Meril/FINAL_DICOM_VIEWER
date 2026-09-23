from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config.config import settings

DATABASE_URL = settings.DATABASE_URL or f"postgresql://{settings.DATABASE_USER}:{settings.DATABASE_PASSWORD}@{settings.DATABASE_HOST}:{settings.DATABASE_PORT}/{settings.DATABASE_DB}"

# Use SQLite fallback in development if running locally without Postgres active
if not settings.DATABASE_URL and settings.DATABASE_HOST == "localhost" and settings.DATABASE_PASSWORD == "postgres":
    DATABASE_URL = "sqlite:///./medview_pro.db"

engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency to get db session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
