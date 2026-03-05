"""
backend/processing/schemas.py

Pydantic v2 request and response models for the /api/process/* endpoints.
These are the "connector point" models your frontends POST to.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


# =================================================================== #
#  REQUEST MODELS — connector point inputs                             #
# =================================================================== #

class SymptomsPayload(BaseModel):
    """
    Patient symptoms and history.

    Your symptoms/history module should POST data matching this shape.
    All fields are optional except `text`; include whatever the module provides.
    """
    text: str = Field(..., description="Free-text patient symptoms and history")
    age: Optional[int] = Field(None, description="Patient age in years")
    sex: Optional[str] = Field(None, description="'M' | 'F' | 'Other'")
    chief_complaint: Optional[str] = Field(None, description="Primary complaint in one line")
    additional: Optional[Dict[str, Any]] = Field(
        None, description="Any extra structured fields from your symptoms module"
    )


class ECGPayload(BaseModel):
    """
    ECG analysis results.

    Pass `status='skipped'` if ECG was not available.
    """
    status: Literal["present", "skipped", "error"] = Field(
        default="present",
        description="'present' | 'skipped' | 'error'",
    )
    skip_reason: Optional[str] = None
    rhythm: Optional[str] = None
    heart_rate: Optional[int] = None
    qrs_duration: Optional[float] = None
    st_segment: Optional[str] = None
    interpretation: Optional[str] = None
    findings: Optional[List[str]] = None
    raw: Optional[Dict[str, Any]] = Field(
        None, description="Full raw ECG output from your ECG module"
    )


class LabPayload(BaseModel):
    """
    Laboratory test results.

    Pass `status='skipped'` if labs were not available.
    """
    status: Literal["present", "skipped", "error"] = Field(
        default="present",
        description="'present' | 'skipped' | 'error'",
    )
    skip_reason: Optional[str] = None
    troponin: Optional[float] = None
    ldh: Optional[float] = None
    bnp: Optional[float] = None
    creatinine: Optional[float] = None
    hemoglobin: Optional[float] = None
    findings: Optional[List[str]] = None
    raw: Optional[Dict[str, Any]] = Field(
        None, description="Full raw lab output from your lab module"
    )


class AnalyzeRequest(BaseModel):
    """
    Main analysis request — the three connector-point inputs.

    This is the POST body your frontend sends to /api/process/analyze.
    """
    symptoms: SymptomsPayload = Field(
        ..., description="Connector point 1: patient symptoms & history"
    )
    ecg: Optional[ECGPayload] = Field(
        None, description="Connector point 2: ECG analysis (null if skipped)"
    )
    labs: Optional[LabPayload] = Field(
        None, description="Connector point 3: lab results (null if skipped)"
    )
    experience_level: str = Field(
        default="seasoned",
        description="'newbie' | 'seasoned' | 'expert' — controls ORA output verbosity",
    )


# =================================================================== #
#  RESPONSE MODELS                                                      #
# =================================================================== #

class PipelineStepInfo(BaseModel):
    """Timing and status for each pipeline step."""
    step: str
    status: str
    duration_ms: Optional[int] = None
    supabase_id: Optional[str] = None



class RareCaseAlertResponse(BaseModel):
    """Rare-case detection alert included when triggered."""
    triggered: bool
    condition: str = ""
    similarity_score: float = 0.0
    source_pmcid: Optional[str] = None
    source_url: Optional[str] = None
    doi: Optional[str] = None
    diseases: List[str] = Field(default_factory=list)
    year: Optional[str] = None
    contradictions: List[str] = Field(default_factory=list)
    missing_data: List[str] = Field(default_factory=list)
    reasoning: str = ""


class AnalysisResponse(BaseModel):
    """
    Full response returned by /api/process/analyze.
    """
    session_id: str = Field(..., description="Local SQLite session UUID for tracking")
    status: str = Field(..., description="'COMPLETED' | 'PARTIAL' | 'FAILED'")

    # Supabase references for downstream use
    supabase_payload_id: Optional[str] = Field(
        None, description="Row ID in analysis_payloads table"
    )
    supabase_kra_id: Optional[str] = Field(
        None, description="Row ID in kra_outputs table"
    )
    supabase_ora_id: Optional[str] = Field(
        None, description="Row ID in ora_outputs table"
    )

    # ORA output — the clinician-facing result
    refined_output: Optional[str] = Field(
        None, description="ORA-formatted clinical diagnostic report"
    )
    disclaimer: Optional[str] = Field(
        None, description="Mandatory AI disclaimer from ORA"
    )

    # KRA raw output (for debugging / research use)
    kra_raw: Optional[str] = Field(
        None, description="Raw KRA Markdown/text output"
    )

    # Rare-case detection
    rare_case_alert: Optional[RareCaseAlertResponse] = Field(
        None, description="Rare pathology detection alert (present only when triggered)"
    )

    # Pipeline metadata
    experience_level: str
    processing_steps: List[PipelineStepInfo] = Field(default_factory=list)
    total_duration_ms: Optional[int] = None
    error: Optional[str] = Field(
        None, description="Error message if status='FAILED'"
    )


class SessionStatusResponse(BaseModel):
    """Response for GET /api/process/session/{session_id}."""
    session_id: str
    status: str
    step: Optional[str]
    experience_level: str
    supabase_payload_id: Optional[str]
    supabase_kra_id: Optional[str]
    supabase_ora_id: Optional[str]
    error_message: Optional[str]
    created_at: str
    updated_at: str


class HealthResponse(BaseModel):
    """Response for GET /api/process/health."""
    status: str
    faiss_ready: bool
    rare_cases_ready: bool = False
    supabase_ready: bool
    kra_endpoint: str
    ora_endpoint: str
