from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

# --- User & Token Schemas ---
class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    role: str
    is_active: bool

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None


# --- DICOM Schemas ---
class StudyResponse(BaseModel):
    study_instance_uid: str
    patient_name: str
    patient_id: str
    patient_birth_date: Optional[str] = None
    patient_sex: Optional[str] = None
    study_date: Optional[str] = None
    study_time: Optional[str] = None
    accession_number: Optional[str] = None
    study_description: Optional[str] = None
    modalities_in_study: Optional[str] = None
    number_of_study_related_series: int = 0
    number_of_study_related_instances: int = 0
    institution: Optional[str] = None

class SeriesResponse(BaseModel):
    series_instance_uid: str
    study_instance_uid: str
    series_number: int
    modality: str
    series_description: Optional[str] = None
    number_of_series_related_instances: int = 0

class InstanceResponse(BaseModel):
    sop_instance_uid: str
    series_instance_uid: str
    study_instance_uid: str
    instance_number: int
    modality: Optional[str] = None
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    rows: Optional[int] = None
    columns: Optional[int] = None
    bits_allocated: Optional[int] = 16
    bits_stored: Optional[int] = 12
    high_bit: Optional[int] = 11
    pixel_spacing: Optional[List[float]] = None
    image_orientation: Optional[List[float]] = None
    image_position: Optional[List[float]] = None
    slice_thickness: Optional[float] = None
    window_center: Optional[Any] = None
    window_width: Optional[Any] = None
    rescale_intercept: Optional[float] = None
    rescale_slope: Optional[float] = None
    photometric_interpretation: Optional[str] = None


# --- Measurement & Annotation Schemas ---
class MeasurementBase(BaseModel):
    id: str
    tool_type: str
    points: List[Dict[str, float]]
    calculated_value: Optional[float] = None
    mean_hu: Optional[float] = None
    study_instance_uid: str

class MeasurementCreate(MeasurementBase):
    session_id: str

class MeasurementResponse(MeasurementBase):
    session_id: str
    created_at: datetime

    class Config:
        from_attributes = True

class AnnotationBase(BaseModel):
    id: str
    text_content: str
    coords: Dict[str, float]
    study_instance_uid: str

class AnnotationCreate(AnnotationBase):
    session_id: str

class AnnotationResponse(AnnotationBase):
    session_id: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Viewer Session Schemas ---
class SessionBase(BaseModel):
    id: str
    active_study_uid: str
    current_layout: str = "2x2 Quad"
    active_viewport_id: int = 1

class SessionResponse(SessionBase):
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
