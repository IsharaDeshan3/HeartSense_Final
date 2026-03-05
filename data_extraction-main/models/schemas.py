from models.patient_state import PatientState
from pydantic import BaseModel, Field

class TranslationRequest(BaseModel):
    text: str
    source_language: str = "si"
    target_language: str = "en"

class TranslationResponse(BaseModel):
    original_text: str
    translated_text: str

class MedicalExtractionRequest(BaseModel):
    translated_text: str

class OrchestrationRequest(BaseModel):
    session_id: str
    transcript_si: str
    current_state: PatientState

class OrchestrationResponse(BaseModel):
    updated_state: PatientState
    missing_critical: dict
    translated_text: str
