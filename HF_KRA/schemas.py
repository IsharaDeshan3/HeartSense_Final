from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class PatientContext(BaseModel):
    """Optional demographic and clinical context for a single KRA request."""

    patient_id: Optional[str] = None
    age: Optional[int] = Field(default=None, ge=0)
    sex: Optional[str] = None
    chief_complaint: Optional[str] = None
    history_of_present_illness: Optional[str] = None
    past_medical_history: Optional[str] = None


class KRARequest(BaseModel):
    """HTTP request body accepted by the Hugging Face KRA Space."""

    symptoms: str = Field(..., min_length=1)
    ecg: Optional[dict[str, Any]] = None
    labs: Optional[dict[str, Any]] = None
    history: Optional[dict[str, Any]] = None
    patient_context: Optional[PatientContext] = None
    preferred_language: str = Field(default="en")


class KRAResult(BaseModel):
    """Structured output returned by the KRA analysis endpoint."""

    summary: str
    diagnoses: list[str] = Field(default_factory=list)
    differential: list[str] = Field(default_factory=list)
    red_flags: list[str] = Field(default_factory=list)
    recommended_tests: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    reasoning: str = ""
    raw_output: str = ""


class KRAResponse(BaseModel):
    """Full API response envelope returned to callers."""

    ok: bool = True
    model_id: str
    result: KRAResult
    metadata: dict[str, Any] = Field(default_factory=dict)
