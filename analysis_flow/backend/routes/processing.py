"""
backend/routes/processing.py

FastAPI router exposing the 3 public connector-point endpoints:

  POST /api/process/analyze        — main analysis trigger
  GET  /api/process/session/{id}   — session status retrieval
  GET  /api/process/health         — pipeline component health check
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException, status

# Ensure root is on path for faiss_retriever import
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.processing.pipeline_service import PipelineService
from backend.processing.session_store import SessionStore
from backend.processing.search_service import SearchService
from backend.processing.kra_client import KRAClient
from backend.processing.ora_client import ORAClient
from backend.processing.supabase_payload import ping_supabase
from backend.processing.schemas import (
    AnalyzeRequest,
    AnalysisResponse,
    SessionStatusResponse,
    HealthResponse,
    PipelineStepInfo,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Lazy singletons — initialised on first request to avoid blocking startup
_pipeline: PipelineService | None = None
_store: SessionStore | None = None


def _get_pipeline() -> PipelineService:
    global _pipeline
    if _pipeline is None:
        _pipeline = PipelineService()
    return _pipeline


def _get_store() -> SessionStore:
    global _store
    if _store is None:
        _store = SessionStore()
    return _store


# =================================================================== #
#  POST /api/process/analyze                                            #
# =================================================================== #

@router.post(
    "/analyze",
    response_model=AnalysisResponse,
    summary="Run full KRA-ORA analysis pipeline",
    description=(
        "Accepts the three connector-point inputs (symptoms, ECG, labs), "
        "runs 7-step pipeline, and returns the ORA-refined clinical report."
    ),
)
async def analyze(request: AnalyzeRequest) -> AnalysisResponse:
    """
    **Connector points:**
    - `symptoms` — patient history & symptoms from your symptoms module
    - `ecg` — ECG findings from your ECG module (pass `null` if skipped)
    - `labs` — lab results from your lab module (pass `null` if skipped)
    """
    if not request.symptoms.text.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="symptoms.text must not be empty",
        )

    try:
        pipeline = _get_pipeline()
        result = pipeline.run(request)
    except Exception as exc:
        logger.exception("Unhandled pipeline error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Pipeline error: {str(exc)}",
        )

    return AnalysisResponse(
        session_id=result.session_id,
        status=result.status,
        supabase_payload_id=result.supabase_payload_id,
        supabase_kra_id=result.supabase_kra_id,
        supabase_ora_id=result.supabase_ora_id,
        refined_output=result.refined_output,
        disclaimer=result.disclaimer,
        kra_raw=result.kra_raw,
        experience_level=result.experience_level,
        processing_steps=[
            PipelineStepInfo(
                step=s.step,
                status=s.status,
                duration_ms=s.duration_ms,
                supabase_id=s.supabase_id,
            )
            for s in result.steps
        ],
        total_duration_ms=result.total_duration_ms,
        error=result.error,
    )


# =================================================================== #
#  GET /api/process/session/{session_id}                                #
# =================================================================== #

@router.get(
    "/session/{session_id}",
    response_model=SessionStatusResponse,
    summary="Get pipeline session status",
    description="Returns the current step, status, and Supabase row IDs for a session.",
)
async def get_session(session_id: str) -> SessionStatusResponse:
    store = _get_store()
    row = store.get(session_id)

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found",
        )

    return SessionStatusResponse(
        session_id=row["session_id"],
        status=row["status"],
        step=row.get("step"),
        experience_level=row.get("experience_level", "seasoned"),
        supabase_payload_id=row.get("supabase_payload_id"),
        supabase_kra_id=row.get("supabase_kra_id"),
        supabase_ora_id=row.get("supabase_ora_id"),
        error_message=row.get("error_message"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


# =================================================================== #
#  GET /api/process/health                                              #
# =================================================================== #

@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Pipeline health check",
    description="Checks FAISS index, Supabase connectivity, and HF Space endpoints.",
)
async def health() -> HealthResponse:
    search = SearchService()
    faiss_ok = search.is_ready()
    supabase_ok = ping_supabase()

    kra_endpoint = os.getenv("KRA_ENDPOINT", "NOT_SET")
    ora_endpoint = os.getenv("ORA_ENDPOINT", "NOT_SET")

    overall = "ok" if (faiss_ok and supabase_ok) else "degraded"

    return HealthResponse(
        status=overall,
        faiss_ready=faiss_ok,
        supabase_ready=supabase_ok,
        kra_endpoint=kra_endpoint,
        ora_endpoint=ora_endpoint,
    )
