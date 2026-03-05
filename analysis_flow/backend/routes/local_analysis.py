from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.models import ECGPayload, LabsPayload, PatientCase
from core.pipeline import DiagnosisPipeline


router = APIRouter()


class LocalAnalysisRequest(BaseModel):
    symptoms: str = Field(..., description="Free text symptoms/history")
    ecg: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Any ECG JSON payload")
    labs: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Any Labs JSON payload")
    lab_component_recommendations: List[str] = Field(default_factory=list)


_pipeline: Optional[DiagnosisPipeline] = None


def get_pipeline() -> DiagnosisPipeline:
    global _pipeline
    if _pipeline is None:
        max_chars = int(os.getenv("KRA_MAX_CHARS", "24000"))
        _pipeline = DiagnosisPipeline(max_chars=max_chars)
    return _pipeline


@router.post("/analyze")
async def analyze(request: LocalAnalysisRequest):
    if not request.symptoms.strip():
        raise HTTPException(status_code=400, detail="Missing symptoms")

    case = PatientCase(
        symptoms_text=request.symptoms,
        ecg=ECGPayload(data=request.ecg or {}),
        labs=LabsPayload(data=request.labs or {}),
        lab_component_recommendations=request.lab_component_recommendations,
    )
    return get_pipeline().run(case)
