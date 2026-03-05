from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from backend.processing.workflow_state import WorkflowState
from backend.processing.workflow_store import WorkflowStore
from backend.processing.workflow_service import WorkflowService


router = APIRouter()
_store = WorkflowStore()
_workflow = WorkflowService()


class SessionInitRequest(BaseModel):
    patient_id: str = Field(..., min_length=1)
    doctor_id: Optional[str] = None
    correlation_id: str = Field(..., min_length=1)


class SessionInitResponse(BaseModel):
    session_id: str
    state: str


class StepSaveResponse(BaseModel):
    session_id: str
    state: str
    saved_step: str
    revision: int
    updated_at: str


class ExtractionSaveRequest(BaseModel):
    symptoms: list[str] = Field(default_factory=list)
    risk_factors: list[str] = Field(default_factory=list)
    translated_text: Optional[str] = None
    raw: Optional[dict[str, Any]] = None


class ECGSaveRequest(BaseModel):
    result: dict[str, Any]


class LabSaveRequest(BaseModel):
    result: dict[str, Any]


class AnalysisRunRequest(BaseModel):
    experience_level: str = Field(default="seasoned")


@router.post("/session/init", response_model=SessionInitResponse)
async def init_session(payload: SessionInitRequest) -> SessionInitResponse:
    row = _store.create_session(
        patient_id=payload.patient_id,
        doctor_id=payload.doctor_id,
        correlation_id=payload.correlation_id,
    )
    return SessionInitResponse(session_id=row["session_id"], state=row["current_state"])


@router.get("/session/{session_id}")
async def get_session(session_id: str) -> dict[str, Any]:
    session = _store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


@router.post("/session/{session_id}/extraction", response_model=StepSaveResponse)
async def save_extraction(session_id: str, payload: ExtractionSaveRequest) -> StepSaveResponse:
    try:
        result = _store.save_step(
            session_id=session_id,
            step_name="extraction",
            payload=payload.model_dump(),
            next_state=WorkflowState.EXTRACTION_DONE,
        )
        return StepSaveResponse(**result)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post("/session/{session_id}/ecg", response_model=StepSaveResponse)
async def save_ecg(session_id: str, payload: ECGSaveRequest) -> StepSaveResponse:
    try:
        result = _store.save_step(
            session_id=session_id,
            step_name="ecg",
            payload=payload.model_dump(),
            next_state=WorkflowState.ECG_DONE,
        )
        return StepSaveResponse(**result)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post("/session/{session_id}/lab", response_model=StepSaveResponse)
async def save_lab(session_id: str, payload: LabSaveRequest) -> StepSaveResponse:
    try:
        result = _store.save_step(
            session_id=session_id,
            step_name="lab",
            payload=payload.model_dump(),
            next_state=WorkflowState.LAB_DONE,
        )
        return StepSaveResponse(**result)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post("/session/{session_id}/analysis/run")
async def run_analysis(session_id: str, payload: AnalysisRunRequest) -> dict[str, Any]:
    try:
        return _workflow.run_analysis(
            session_id=session_id,
            experience_level=payload.experience_level,
        )
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Analysis failed: {exc}")
