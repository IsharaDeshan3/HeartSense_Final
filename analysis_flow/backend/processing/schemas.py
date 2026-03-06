"""
backend/processing/schemas.py

Pydantic request models for the analysis pipeline.

These schemas are used by:
  - PipelineService.run()
  - WorkflowService (via internal AnalyzeRequest construction)
  - SearchService.search_from_request()
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# --------------------------------------------------------------------- #
#  Sub-models                                                            #
# --------------------------------------------------------------------- #

class SymptomsPayload(BaseModel):
    """Free-text patient presentation plus structured demographic fields."""

    text: str = Field(..., description="Full symptom description in natural language")
    age: Optional[int] = Field(None, ge=0, le=130, description="Patient age in years")
    sex: Optional[str] = Field(None, description="Patient sex (male / female / other)")
    chief_complaint: Optional[str] = Field(None, description="One-line chief complaint")
    risk_factors: Optional[List[str]] = Field(default_factory=list)
    history: Optional[str] = Field(None, description="Relevant past medical history")


class ECGPayload(BaseModel):
    """
    Structured ECG findings.

    Set status='skipped' when no ECG was performed — all other fields
    are optional in that case.
    """

    status: str = Field(
        default="available",
        description="'available' | 'skipped'",
    )
    rhythm: Optional[str] = None
    heart_rate: Optional[int] = Field(None, ge=0, le=400, description="Beats per minute")
    pr_interval: Optional[float] = Field(None, description="PR interval in ms")
    qrs_duration: Optional[float] = Field(None, description="QRS duration in ms")
    qt_interval: Optional[float] = Field(None, description="QT interval in ms")
    qtc_interval: Optional[float] = Field(None, description="Corrected QT interval in ms")
    st_segment: Optional[str] = Field(None, description="ST-segment description (elevation / depression / normal)")
    t_wave: Optional[str] = None
    axis: Optional[str] = None
    interpretation: Optional[str] = Field(None, description="Overall ECG interpretation")
    findings: Optional[List[str]] = Field(default_factory=list, description="List of specific ECG findings")
    raw_text: Optional[str] = Field(None, description="Raw ECG report or notes")


class LabsPayload(BaseModel):
    """
    Structured laboratory results.

    Set status='skipped' when no labs were drawn.
    """

    status: str = Field(
        default="available",
        description="'available' | 'skipped'",
    )
    # Cardiac biomarkers
    troponin: Optional[float] = Field(None, description="Troponin I or T (ng/mL)")
    troponin_type: Optional[str] = Field(None, description="'troponin_i' | 'troponin_t' | 'hs_troponin'")
    bnp: Optional[float] = Field(None, description="BNP (pg/mL)")
    nt_pro_bnp: Optional[float] = Field(None, description="NT-proBNP (pg/mL)")
    ck_mb: Optional[float] = Field(None, description="CK-MB (U/L)")
    ldh: Optional[float] = Field(None, description="LDH (U/L)")
    d_dimer: Optional[float] = Field(None, description="D-dimer (mg/L FEU)")

    # CBC
    hemoglobin: Optional[float] = Field(None, description="Hemoglobin (g/dL)")
    wbc: Optional[float] = Field(None, description="White blood cell count (×10⁹/L)")
    platelets: Optional[float] = Field(None, description="Platelet count (×10⁹/L)")

    # Metabolic panel
    sodium: Optional[float] = Field(None, description="Sodium (mEq/L)")
    potassium: Optional[float] = Field(None, description="Potassium (mEq/L)")
    creatinine: Optional[float] = Field(None, description="Creatinine (mg/dL)")
    egfr: Optional[float] = Field(None, description="eGFR (mL/min/1.73m²)")
    glucose: Optional[float] = Field(None, description="Blood glucose (mg/dL)")
    hba1c: Optional[float] = Field(None, description="HbA1c (%)")

    # Lipids
    total_cholesterol: Optional[float] = Field(None, description="Total cholesterol (mg/dL)")
    ldl: Optional[float] = Field(None, description="LDL cholesterol (mg/dL)")
    hdl: Optional[float] = Field(None, description="HDL cholesterol (mg/dL)")
    triglycerides: Optional[float] = Field(None, description="Triglycerides (mg/dL)")

    # Coagulation / inflammation
    inr: Optional[float] = Field(None, description="INR")
    crp: Optional[float] = Field(None, description="CRP (mg/L)")
    esr: Optional[float] = Field(None, description="ESR (mm/hr)")

    # Free-text
    findings: Optional[List[str]] = Field(
        default_factory=list,
        description="Notable lab findings in free text",
    )
    raw_text: Optional[str] = Field(None, description="Full lab report text")


# --------------------------------------------------------------------- #
#  Primary request model                                                 #
# --------------------------------------------------------------------- #

class AnalyzeRequest(BaseModel):
    """
    Top-level request model for the analysis pipeline.

    Passed directly into PipelineService.run() and
    WorkflowService._run_analysis_pipeline().
    """

    symptoms: SymptomsPayload
    ecg: Optional[ECGPayload] = None
    labs: Optional[LabsPayload] = None
    experience_level: str = Field(
        default="seasoned",
        description="'newbie' | 'seasoned' – controls ORA output verbosity",
    )
    patient_id: Optional[str] = Field(
        None,
        description="MongoDB patient _id (hex string). Used for Supabase row linking.",
    )
    doctor_id: Optional[str] = Field(
        None,
        description="Doctor identifier – stored for audit trail.",
    )
    session_id: Optional[str] = Field(
        None,
        description="Workflow session_id if this request is part of a multi-step session.",
    )
    context_override: Optional[str] = Field(
        None,
        description="Optional pre-built context string – skips FAISS search when provided.",
    )

    class Config:
        # Allow extra fields so callers can pass additional metadata
        # without breaking validation.
        extra = "ignore"
