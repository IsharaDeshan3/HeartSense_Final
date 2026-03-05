from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ExperienceLevel(str, Enum):
    NEWBIE = "NEWBIE"
    SEASONED = "SEASONED"


class ECGPayload(BaseModel):
    """Universal ECG payload.

    Your ECG component can emit any JSON. We store it as-is.
    """

    data: Dict[str, Any] = Field(default_factory=dict)


class LabsPayload(BaseModel):
    """Universal Labs payload.

    Your lab component can emit any JSON; typically includes free-text and flags.
    """

    data: Dict[str, Any] = Field(default_factory=dict)


class PatientCase(BaseModel):
    symptoms_text: str = Field(..., description="Free-text patient symptoms/history")
    ecg: ECGPayload = Field(default_factory=ECGPayload)
    labs: LabsPayload = Field(default_factory=LabsPayload)

    # Optional: upstream lab component can provide recommended missing labs/tests.
    lab_component_recommendations: List[str] = Field(default_factory=list)


class RetrievedChunk(BaseModel):
    source: str = Field(..., description="books|rare_cases|feedback")
    text: str
    score: float
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RetrievalQuality(BaseModel):
    status: str
    confidence: float = 0.0
    top_score: float = 0.0
    avg_score: float = 0.0
    num_results: int = 0


class KRADiagnosis(BaseModel):
    condition: str
    confidence: float
    severity: str = "MODERATE"
    evidence: List[str] = Field(default_factory=list)
    clinical_features: List[str] = Field(default_factory=list)
    # optional, depending on your KRA prompt/model
    rationale: Optional[str] = None


class KRAResult(BaseModel):
    diagnoses: List[KRADiagnosis] = Field(default_factory=list)
    uncertainties: List[str] = Field(default_factory=list)
    recommended_tests: List[str] = Field(default_factory=list)
    red_flags: List[str] = Field(default_factory=list)
    raw_output: str = ""
    success: bool = True
    error_message: str = ""
    retrieval_quality: Optional[Dict[str, Any]] = None


class ORAResult(BaseModel):
    primary_diagnosis: str = ""
    differential_diagnoses: List[str] = Field(default_factory=list)
    formatted_diagnosis: str = ""
    disclaimer: str = ""
    validation_passed: bool = True
    success: bool = True
    error_message: str = ""
    raw_output: str = ""


@dataclass
class SafetyReport:
    passed: bool
    is_critical: bool
    banner: str
    reasons: List[str]
