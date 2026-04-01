from pydantic import BaseModel, EmailStr, Field
from pydantic_core import core_schema
from typing import Optional, Literal, Any
from datetime import datetime
from bson import ObjectId


def validate_objectid(value: Any) -> ObjectId:
    """Validate and convert to ObjectId."""
    if isinstance(value, ObjectId):
        return value
    if isinstance(value, str):
        if ObjectId.is_valid(value):
            return ObjectId(value)
        raise ValueError("Invalid ObjectId string")
    raise ValueError("Invalid ObjectId")


class PyObjectId(ObjectId):
    """Custom ObjectId type for Pydantic v2."""
    
    @classmethod
    def __get_pydantic_core_schema__(
        cls, source_type: Any, handler
    ) -> core_schema.CoreSchema:
        return core_schema.no_info_after_validator_function(
            validate_objectid,
            core_schema.str_schema(),
        )


# Doctor Models
class DoctorSignup(BaseModel):
    """Model for doctor signup."""
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=72)
    doctor_id: str = Field(..., min_length=1)
    role: Literal["doctor"] = "doctor"


class Doctor(BaseModel):
    """Doctor model."""
    id: Optional[str] = Field(default=None, alias="_id")
    name: str
    email: EmailStr
    doctor_id: str
    role: Literal["doctor"] = "doctor"
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
        "json_encoders": {ObjectId: str}
    }


# Patient Models
class PatientSignup(BaseModel):
    """Model for patient signup."""
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=72)
    age: int = Field(..., ge=1, le=150)
    role: Literal["patient"] = "patient"


class Patient(BaseModel):
    """Patient model."""
    id: Optional[str] = Field(default=None, alias="_id")
    name: str
    email: EmailStr
    age: int
    role: Literal["patient"] = "patient"
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
        "json_encoders": {ObjectId: str}
    }


# Common Models
class UserLogin(BaseModel):
    """Model for user login."""
    email: EmailStr
    password: str = Field(..., max_length=72)


class Token(BaseModel):
    """Token response model."""
    access_token: str
    token_type: str = "bearer"
    user_id: str
    role: str
    name: str


class UserResponse(BaseModel):
    """User response model (without password)."""
    id: str
    name: str
    email: str
    role: str
    created_at: datetime
    
    model_config = {
        "json_encoders": {ObjectId: str}
    }


# Diabetic Models
class DiabeticCreate(BaseModel):
    """Model for creating/updating diabetic patient data."""
    userId: str = Field(..., min_length=1)
    Age: Optional[float] = None  # Can accept both int and float
    BMI: Optional[float] = None
    BUN: Optional[float] = None
    Chol: Optional[float] = None
    Cr: Optional[float] = None
    Gender: Optional[str] = None
    HDL: Optional[float] = None
    LDL: Optional[float] = None
    TG: Optional[float] = None


class Diabetic(BaseModel):
    """Diabetic patient model."""
    id: Optional[str] = Field(default=None, alias="_id")
    userId: str
    Age: Optional[float] = None  # Can accept both int and float
    BMI: Optional[float] = None
    BUN: Optional[float] = None
    Chol: Optional[float] = None
    Cr: Optional[float] = None
    Gender: Optional[str] = None
    HDL: Optional[float] = None
    LDL: Optional[float] = None
    TG: Optional[float] = None
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
    
    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
        "json_encoders": {ObjectId: str}
    }


class DiabeticResponse(BaseModel):
    """Diabetic patient response model."""
    id: str
    userId: str
    Age: Optional[float] = None  # Can accept both int and float
    BMI: Optional[float] = None
    BUN: Optional[float] = None
    Chol: Optional[float] = None
    Cr: Optional[float] = None
    Gender: Optional[str] = None
    HDL: Optional[float] = None
    LDL: Optional[float] = None
    TG: Optional[float] = None
    createdAt: datetime
    updatedAt: datetime
    
    model_config = {
        "json_encoders": {ObjectId: str}
    }


# Heart Models
class HeartCreate(BaseModel):
    """Model for creating/updating heart patient data."""
    userId: str = Field(..., min_length=1)
    age: Optional[float] = None  # Can accept both int and float
    ca: Optional[float] = None
    chol: Optional[float] = None
    cp: Optional[float] = None
    exang: Optional[float] = None
    fbs: Optional[float] = None
    oldpeak: Optional[float] = None
    restecg: Optional[float] = None
    sex: Optional[float] = None
    slope: Optional[float] = None
    thal: Optional[float] = None
    thalach: Optional[float] = None
    trestbps: Optional[float] = None


class Heart(BaseModel):
    """Heart patient model."""
    id: Optional[str] = Field(default=None, alias="_id")
    userId: str
    age: Optional[float] = None  # Can accept both int and float
    ca: Optional[float] = None
    chol: Optional[float] = None
    cp: Optional[float] = None
    exang: Optional[float] = None
    fbs: Optional[float] = None
    oldpeak: Optional[float] = None
    restecg: Optional[float] = None
    sex: Optional[float] = None
    slope: Optional[float] = None
    thal: Optional[float] = None
    thalach: Optional[float] = None
    trestbps: Optional[float] = None
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
    
    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
        "json_encoders": {ObjectId: str}
    }


class HeartResponse(BaseModel):
    """Heart patient response model."""
    id: str
    userId: str
    age: Optional[float] = None  # Can accept both int and float
    ca: Optional[float] = None
    chol: Optional[float] = None
    cp: Optional[float] = None
    exang: Optional[float] = None
    fbs: Optional[float] = None
    oldpeak: Optional[float] = None
    restecg: Optional[float] = None
    sex: Optional[float] = None
    slope: Optional[float] = None
    thal: Optional[float] = None
    thalach: Optional[float] = None
    trestbps: Optional[float] = None
    createdAt: datetime
    updatedAt: datetime
    
    model_config = {
        "json_encoders": {ObjectId: str}
    }


# Patient History Models
class PatientHistoryCreate(BaseModel):
    """Model for creating patient history."""
    userId: str = Field(..., min_length=1)
    extractedJsonGroup1: dict = Field(default_factory=dict)
    extractedJsonGroup2: dict = Field(default_factory=dict)
    isMedical: bool = True
    labComparison: list = Field(default_factory=list)
    patientInfo: dict = Field(default_factory=dict)
    recommendedTests: list = Field(default_factory=list)
    summary: str = Field(..., min_length=1)


class PatientHistory(BaseModel):
    """Patient history model."""
    id: Optional[str] = Field(default=None, alias="_id")
    userId: str
    extractedJsonGroup1: dict
    extractedJsonGroup2: dict
    isMedical: bool
    labComparison: list
    patientInfo: dict
    recommendedTests: list
    summary: str
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    
    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
        "json_encoders": {ObjectId: str}
    }


class PatientHistoryResponse(BaseModel):
    """Patient history response model."""
    id: str
    userId: str
    extractedJsonGroup1: dict
    extractedJsonGroup2: dict
    isMedical: bool
    labComparison: list
    patientInfo: dict
    recommendedTests: list
    summary: str
    createdAt: datetime
    
    model_config = {
        "json_encoders": {ObjectId: str}
    }


# Recommendation Models
class RecommendationCreate(BaseModel):
    """Model for creating a recommendation."""
    patient_id: str = Field(..., min_length=1)
    recommendation: str = Field(..., min_length=1)


class Recommendation(BaseModel):
    """Recommendation model."""
    id: Optional[str] = Field(default=None, alias="_id")
    doctor_id: str
    doctor_name: str
    patient_id: str
    patient_name: Optional[str] = None
    date: datetime = Field(default_factory=datetime.utcnow)
    recommendation: str
    
    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
        "json_encoders": {ObjectId: str}
    }


class RecommendationResponse(BaseModel):
    """Recommendation response model."""
    id: str
    doctor_id: str
    doctor_name: str
    patient_id: str
    patient_name: Optional[str] = None
    date: datetime
    recommendation: str
    
    model_config = {
        "json_encoders": {ObjectId: str}
    }

