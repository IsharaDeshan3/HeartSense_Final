from __future__ import annotations

import asyncio
import json
import logging
import traceback
from typing import Any, AsyncGenerator, Optional

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

from backend.processing.workflow_state import WorkflowState
from backend.processing.workflow_store import WorkflowStore
from backend.processing.workflow_service import WorkflowService
from backend.processing.supabase_payload import get_patient_history_bundle, ping_supabase


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


class AnalysisStopResponse(BaseModel):
    session_id: str
    state: str
    status: str


@router.get("/health")
async def health() -> dict[str, Any]:
    readiness = _workflow.readiness_status()
    search_readiness = _workflow._search.readiness_status()
    return {
        "status": "ok" if readiness["all_ready"] and search_readiness["faiss_ready"] else "degraded",
        "faiss_ready": search_readiness["faiss_ready"],
        "rare_cases_ready": search_readiness["rare_cases_ready"],
        "supabase_ready": ping_supabase(),
        "kra_model_loaded": readiness["kra"],
        "ora_model_loaded": readiness["ora"],
    }


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
    import asyncio
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None,
            lambda: _workflow.run_analysis(
                session_id=session_id,
                experience_level=payload.experience_level,
            ),
        )
        return result
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except Exception as exc:
        logger.error("Analysis pipeline failed:\n%s", traceback.format_exc())
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Analysis failed: {exc}")


@router.post("/session/{session_id}/analysis/stop", response_model=AnalysisStopResponse)
async def stop_analysis(session_id: str) -> AnalysisStopResponse:
    try:
        result = _workflow.request_stop_analysis(session_id=session_id)
        return AnalysisStopResponse(**result)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")


@router.delete("/patient/{patient_id}/cleanup")
async def cleanup_patient_data(patient_id: str) -> dict[str, Any]:
    """
    Delete all analysis data (Supabase + local SQLite) for a patient.

    Called by the Next.js frontend when a doctor removes a patient.
    """
    from backend.processing.supabase_payload import delete_patient_data
    try:
        result = delete_patient_data(patient_id)
        return {"status": "ok", "patient_id": patient_id, "deleted": result}
    except Exception as exc:
        logger.error("Patient cleanup failed for %s: %s", patient_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Cleanup failed: {exc}",
        )


@router.get("/patient/{patient_id}/history")
async def get_patient_history(patient_id: str) -> dict[str, Any]:
    try:
        return get_patient_history_bundle(patient_id)
    except Exception as exc:
        logger.error("Patient history fetch failed for %s: %s", patient_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"History fetch failed: {exc}",
        )


@router.get("/session/{session_id}/analysis/events")
async def analysis_events(session_id: str, request: Request) -> StreamingResponse:
    """
    Server-Sent Events stream that emits real-time pipeline step updates.

    Each event is a JSON object::

        {"step": "kra_analysis", "status": "started", "duration_ms": 0}
        {"step": "kra_analysis", "status": "completed", "duration_ms": 3210}
        {"step": "analysis_done",  "status": "completed"}

    The stream closes after the "analysis_done" event or when the client
    disconnects.  Subscribe *before* calling /analysis/run so you don't
    miss early events.
    """
    session = _store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    queue = _workflow.event_bus.subscribe(session_id)

    async def generator() -> AsyncGenerator[str, None]:
        try:
            while True:
                if await request.is_disconnected():
                    break
                # Poll the thread-safe queue with a short async sleep to keep
                # the event loop free between polls.
                try:
                    event = await asyncio.get_event_loop().run_in_executor(
                        None, lambda: queue.get(timeout=1)
                    )
                except Exception:
                    # queue.get timed out – check connection and retry
                    continue

                data = json.dumps(event)
                yield f"data: {data}\n\n"

                # Close stream once the terminal event arrives
                if event.get("step") == "analysis_done" or event.get("status") == "error":
                    break
        finally:
            _workflow.event_bus.unsubscribe(session_id, queue)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
