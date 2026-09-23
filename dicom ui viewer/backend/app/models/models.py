from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database.connection import Base

# --- User & Preferences Tables ---
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="radiologist")  # radiologist, administrator, technician
    is_active = Column(Boolean, default=True)

    sessions = relationship("ViewerSession", back_populates="user")
    favorites = relationship("Favorite", back_populates="user")
    recent_studies = relationship("RecentStudy", back_populates="user")


class ViewerPreferences(Base):
    __tablename__ = "viewer_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    theme = Column(String, default="dark")
    language = Column(String, default="en")
    hotkeys = Column(JSON, nullable=True)


# --- Relational DICOM Tables ---
class Patient(Base):
    __tablename__ = "patients"

    id = Column(String, primary_key=True, index=True)  # Patient ID
    patient_name = Column(String, nullable=False)
    patient_birth_date = Column(String, nullable=True)
    patient_sex = Column(String, nullable=True)


class Study(Base):
    __tablename__ = "studies"

    study_instance_uid = Column(String, primary_key=True, index=True)
    patient_id = Column(String, ForeignKey("patients.id"))
    study_date = Column(String, nullable=True)
    study_time = Column(String, nullable=True)
    accession_number = Column(String, nullable=True)
    study_description = Column(String, nullable=True)
    modalities_in_study = Column(String, nullable=True)
    number_of_study_related_series = Column(Integer, default=0)
    number_of_study_related_instances = Column(Integer, default=0)
    institution = Column(String, nullable=True)


class Series(Base):
    __tablename__ = "series"

    series_instance_uid = Column(String, primary_key=True, index=True)
    study_instance_uid = Column(String, ForeignKey("studies.study_instance_uid"))
    series_number = Column(Integer, nullable=False)
    modality = Column(String, nullable=False)
    series_description = Column(String, nullable=True)
    number_of_series_related_instances = Column(Integer, default=0)


class Instance(Base):
    __tablename__ = "instances"

    sop_instance_uid = Column(String, primary_key=True, index=True)
    series_instance_uid = Column(String, ForeignKey("series.series_instance_uid"))
    study_instance_uid = Column(String, ForeignKey("studies.study_instance_uid"))
    instance_number = Column(Integer, nullable=False)
    file_path = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)


# --- Workstation Sessions & Annotations ---
class ViewerSession(Base):
    __tablename__ = "viewer_sessions"

    id = Column(String, primary_key=True, index=True)  # session UUID
    user_id = Column(Integer, ForeignKey("users.id"))
    active_study_uid = Column(String, nullable=False)
    current_layout = Column(String, default="2x2 Quad")
    active_viewport_id = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="sessions")
    measurements = relationship("Measurement", back_populates="session", cascade="all, delete-orphan")
    annotations = relationship("Annotation", back_populates="session", cascade="all, delete-orphan")


class Measurement(Base):
    __tablename__ = "measurements"

    id = Column(String, primary_key=True, index=True)  # Measurement UID from cornerstone
    session_id = Column(String, ForeignKey("viewer_sessions.id"))
    tool_type = Column(String, nullable=False)         # length, angle, rect, ellipse
    points = Column(JSON, nullable=False)              # [{"x": 100, "y": 150}, ...]
    calculated_value = Column(Float, nullable=True)    # 12.5 (in mm or degrees)
    mean_hu = Column(Float, nullable=True)             # Hounsfield Unit statistics
    study_instance_uid = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("ViewerSession", back_populates="measurements")


class Annotation(Base):
    __tablename__ = "annotations"

    id = Column(String, primary_key=True, index=True)  # Annotation UID
    session_id = Column(String, ForeignKey("viewer_sessions.id"))
    text_content = Column(String, nullable=False)
    coords = Column(JSON, nullable=False)              # {"x": 120, "y": 80}
    study_instance_uid = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("ViewerSession", back_populates="annotations")


# --- Study History, Favorites, and Audit Trail ---
class Favorite(Base):
    __tablename__ = "favorites"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    study_instance_uid = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="favorites")


class RecentStudy(Base):
    __tablename__ = "recent_studies"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    study_instance_uid = Column(String, nullable=False)
    accessed_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="recent_studies")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True)
    action = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    details = Column(String, nullable=True)
