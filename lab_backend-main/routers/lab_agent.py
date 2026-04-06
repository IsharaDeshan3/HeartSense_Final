from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from models import (
    EvidenceIngestionResponse,
    EvidenceSourceCreate,
    EvidenceSourceResponse,
    LabAgentAnalyzeRequest,
    LabAgentArchitectureResponse,
    LabAgentJobCreate,
    LabAgentJobResponse,
    LabAgentResultResponse,
    OcrJobCreate,
    OcrJobResponse,
    OcrJobResultResponse,
)
from services.lab_agent_service import LabAgentService

router = APIRouter(prefix="/api/lab-agent", tags=["lab-agent"])
service = LabAgentService()


@router.get("/architecture", response_model=LabAgentArchitectureResponse)
async def get_lab_agent_architecture():
    """Return Step-2 architecture boundaries for lab-agent orchestration."""
    return await service.get_architecture_blueprint()


@router.post("/evidence-sources", response_model=EvidenceSourceResponse, status_code=status.HTTP_201_CREATED)
async def create_evidence_source(
    payload: EvidenceSourceCreate,
):
    """Register a trusted evidence source for future citation-grounded analysis."""
    return await service.create_evidence_source(payload)


@router.get("/evidence-sources", response_model=list[EvidenceSourceResponse])
async def list_evidence_sources(
    active_only: bool = True,
):
    """List evidence sources used by the lab-agent architecture."""
    return await service.list_evidence_sources(active_only=active_only)


@router.post("/evidence-sources/{source_id}/ingest", response_model=EvidenceIngestionResponse)
async def ingest_evidence_source(
    source_id: str,
):
    """Fetch one source URL, extract text, and chunk it for local retrieval."""
    return await service.ingest_evidence_source(source_id)


@router.post("/jobs", response_model=LabAgentJobResponse, status_code=status.HTTP_201_CREATED)
async def create_lab_agent_job(
    payload: LabAgentJobCreate,
):
    """Create a new orchestration job for one patient."""
    return await service.create_job(payload)


@router.get("/jobs", response_model=list[LabAgentJobResponse])
async def list_lab_agent_jobs(
    patient_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    """List orchestration jobs."""
    return await service.list_jobs(patient_id=patient_id, limit=limit)


@router.get("/jobs/{job_id}", response_model=LabAgentJobResponse)
async def get_lab_agent_job(
    job_id: str,
):
    """Get one orchestration job."""
    return await service.get_job(job_id)


@router.post("/jobs/{job_id}/analyze", response_model=LabAgentResultResponse)
async def analyze_lab_agent_job(
    job_id: str,
    payload: LabAgentAnalyzeRequest,
):
    """Run evidence-grounded Gemini analysis with strict citation validation."""
    return await service.analyze_job(job_id, payload=payload)


@router.get("/jobs/{job_id}/result", response_model=LabAgentResultResponse)
async def get_lab_agent_job_result(
    job_id: str,
):
    """Get the persisted evidence-grounded result for a job."""
    return await service.get_job_result(job_id)


@router.post("/ocr/jobs", response_model=OcrJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_ocr_job(
    payload: OcrJobCreate,
):
    """Submit OCR work as a background job so API requests return quickly."""
    return await service.create_ocr_job(payload)


@router.get("/ocr/jobs/{ocr_job_id}", response_model=OcrJobResultResponse)
async def get_ocr_job(
    ocr_job_id: str,
):
    """Poll OCR job status and fetch extracted text when completed."""
    return await service.get_ocr_job(ocr_job_id)