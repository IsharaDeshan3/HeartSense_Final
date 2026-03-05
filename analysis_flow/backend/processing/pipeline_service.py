"""
backend/processing/pipeline_service.py

Main orchestrator for the 7-step KRA-ORA processing pipeline.

Step 1 — Save inputs to local SQLite session store
Step 2 — FAISS vector search (medical books + rare cases)
Step 3 — Save {inputs + context} to Supabase analysis_payloads
Step 4 — POST supabase payload_id → KRA HuggingFace Space
Step 5 — Save KRA output to Supabase kra_outputs
Step 6 — POST supabase kra_output_id → ORA HuggingFace Space
Step 7 — Return ORA refined text to the caller (local FastAPI route)
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

from .session_store import SessionStore
from .supabase_payload import (
    save_analysis_payload,
    save_kra_output,
    save_ora_output,
    update_payload_status,
    ping_supabase,
)
from .search_service import SearchService
from .kra_client import KRAClient
from .ora_client import ORAClient
from .schemas import AnalyzeRequest
from core.rare_case_flag import RareCaseAlert

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------- #
#  Result dataclass                                                       #
# --------------------------------------------------------------------- #

@dataclass
class StepResult:
    step: str
    status: str                   # "COMPLETED" | "FAILED" | "SKIPPED"
    duration_ms: int = 0
    supabase_id: Optional[str] = None
    error: Optional[str] = None


@dataclass
class PipelineResult:
    session_id: str
    status: str                   # "COMPLETED" | "PARTIAL" | "FAILED"
    experience_level: str

    # Supabase row references
    supabase_payload_id: Optional[str] = None
    supabase_kra_id: Optional[str] = None
    supabase_ora_id: Optional[str] = None

    # Agent outputs
    kra_raw: Optional[str] = None
    refined_output: Optional[str] = None
    disclaimer: Optional[str] = None

    # Rare-case detection
    rare_case_alert: Optional[Dict[str, Any]] = None

    # Diagnostics
    steps: List[StepResult] = field(default_factory=list)
    total_duration_ms: int = 0
    error: Optional[str] = None


# --------------------------------------------------------------------- #
#  Helpers                                                                #
# --------------------------------------------------------------------- #

def _symptoms_to_dict(req: AnalyzeRequest) -> Dict[str, Any]:
    """Convert SymptomsPayload to a plain dict for Supabase JSON storage."""
    return req.symptoms.model_dump(exclude_none=True)


def _ecg_to_dict(req: AnalyzeRequest) -> Dict[str, Any]:
    if req.ecg is None:
        return {"status": "skipped"}
    return req.ecg.model_dump(exclude_none=True)


def _labs_to_dict(req: AnalyzeRequest) -> Dict[str, Any]:
    if req.labs is None:
        return {"status": "skipped"}
    return req.labs.model_dump(exclude_none=True)


def _build_symptom_text(req: AnalyzeRequest) -> str:
    """
    Build a plain-text symptom string for FAISS embedding.
    Mirrors the logic in the old AnalysisPipeline._build_symptom_text.
    """
    parts = [f"Patient: {req.symptoms.text}"]

    if req.symptoms.age:
        parts.append(f"Age: {req.symptoms.age}")
    if req.symptoms.sex:
        parts.append(f"Sex: {req.symptoms.sex}")
    if req.symptoms.chief_complaint:
        parts.append(f"Chief complaint: {req.symptoms.chief_complaint}")

    ecg = req.ecg
    if ecg and ecg.status != "skipped":
        ecg_parts = ["ECG:"]
        if ecg.rhythm:
            ecg_parts.append(f"Rhythm={ecg.rhythm}")
        if ecg.heart_rate:
            ecg_parts.append(f"HR={ecg.heart_rate}bpm")
        if ecg.st_segment:
            ecg_parts.append(f"ST={ecg.st_segment}")
        if ecg.interpretation:
            ecg_parts.append(ecg.interpretation)
        if ecg.findings:
            ecg_parts.append(", ".join(ecg.findings))
        parts.append(" | ".join(ecg_parts))
    elif ecg and ecg.status == "skipped":
        parts.append("[ECG: Not performed]")

    labs = req.labs
    if labs and labs.status != "skipped":
        lab_parts = ["Labs:"]
        for marker in ["troponin", "ldh", "bnp", "creatinine", "hemoglobin"]:
            val = getattr(labs, marker, None)
            if val is not None:
                lab_parts.append(f"{marker.capitalize()}={val}")
        if labs.findings:
            lab_parts.append(", ".join(labs.findings))
        parts.append(" | ".join(lab_parts))
    elif labs and labs.status == "skipped":
        parts.append("[Labs: Not performed]")

    return "\n".join(parts)


def _format_rare_alert_block(alert: RareCaseAlert) -> str:
    """Format a RareCaseAlert as a clinician-facing text block for ORA output."""
    lines = [
        "",
        "",
        "⚠️  POTENTIAL RARE PATHOLOGY DETECTED",
        "─────────────────────────────────────",
        f"Condition:  {alert.condition}",
        f"Similarity: {alert.similarity_score:.0%} match with case study",
    ]
    if alert.source_url:
        lines.append(f"Source:     {alert.source_pmcid} ({alert.source_url})")
    elif alert.source_pmcid:
        lines.append(f"Source:     {alert.source_pmcid}")
    if alert.doi:
        lines.append(f"DOI:        {alert.doi}")
    if alert.diseases:
        lines.append(f"Diseases:   {', '.join(alert.diseases)}")
    if alert.contradictions:
        lines.append(f"Reasoning:  {'; '.join(alert.contradictions)}")
    if alert.missing_data:
        lines.append(f"Missing:    {', '.join(alert.missing_data)}")
    lines.append("─────────────────────────────────────")
    lines.append("CLINICAL ACTION: Consider targeted workup for this condition.")
    lines.append("")
    return "\n".join(lines)


# --------------------------------------------------------------------- #
#  PipelineService                                                        #
# --------------------------------------------------------------------- #

class PipelineService:
    """
    Orchestrates the full 7-step KRA-ORA analysis pipeline.

    Instantiate once (singleton in the FastAPI route) and call `.run()`.
    """

    def __init__(self) -> None:
        self._store = SessionStore()
        self._search = SearchService()
        self._kra = KRAClient()
        self._ora = ORAClient()
        logger.info("PipelineService initialised")

    # ------------------------------------------------------------------ #

    def run(self, req: AnalyzeRequest) -> PipelineResult:
        """
        Execute all 7 pipeline steps for an incoming analysis request.

        Args:
            req: AnalyzeRequest — the three connector-point inputs.

        Returns:
            PipelineResult with session tracking info, Supabase IDs, and
            the ORA-refined diagnostic output.
        """
        pipeline_start = time.time()
        steps: List[StepResult] = []

        experience_level = req.experience_level.upper()
        symptoms_text = _build_symptom_text(req)

        # ---- STEP 1: Create local SQLite session -------------------- #
        t0 = time.time()
        try:
            session_id = self._store.create(
                symptoms=_symptoms_to_dict(req),
                ecg=_ecg_to_dict(req),
                labs=_labs_to_dict(req),
                experience_level=req.experience_level,
            )
            steps.append(StepResult(
                step="SESSION_INIT",
                status="COMPLETED",
                duration_ms=int((time.time() - t0) * 1000),
            ))
        except Exception as exc:
            logger.error("Step 1 failed: %s", exc)
            return PipelineResult(
                session_id="unknown",
                status="FAILED",
                experience_level=req.experience_level,
                steps=[StepResult("SESSION_INIT", "FAILED", error=str(exc))],
                error=f"Session creation failed: {exc}",
            )

        result = PipelineResult(
            session_id=session_id,
            status="IN_PROGRESS",
            experience_level=req.experience_level,
            steps=steps,
        )

        # ---- STEP 2: FAISS search + rare-case detection ---------------- #
        self._store.update_status(session_id, "FAISS_SEARCH", "IN_PROGRESS")
        t0 = time.time()
        context_text = ""
        quality: Dict[str, Any] = {}
        rare_alert = RareCaseAlert(triggered=False)
        try:
            context_text, quality, rare_alert = self._search.search_from_request(
                req,
                top_k=5,
                include_rare=True,
            )
            result.rare_case_alert = rare_alert.to_dict() if rare_alert.triggered else None
            steps.append(StepResult(
                step="FAISS_SEARCH",
                status="COMPLETED",
                duration_ms=int((time.time() - t0) * 1000),
            ))
            if rare_alert.triggered:
                logger.warning(
                    "RARE CASE ALERT triggered: %s (score=%.3f)",
                    rare_alert.condition, rare_alert.similarity_score,
                )
            logger.info("FAISS search done: %d chars context", len(context_text))
        except Exception as exc:
            logger.warning("Step 2 FAISS search failed (continuing): %s", exc)
            steps.append(StepResult("FAISS_SEARCH", "FAILED", error=str(exc)))
            # Non-fatal — proceed with empty context

        # ---- STEP 3: Save payload to Supabase ----------------------- #
        self._store.update_status(session_id, "SUPABASE_SAVE_PAYLOAD", "IN_PROGRESS")
        t0 = time.time()
        payload_id: Optional[str] = None
        try:
            payload_id, payload_url = save_analysis_payload(
                session_id=session_id,
                symptoms=_symptoms_to_dict(req),
                ecg=_ecg_to_dict(req),
                labs=_labs_to_dict(req),
                context_text=context_text,
                quality=quality,
            )
            self._store.set_supabase_ids(session_id, payload_id=payload_id)
            result.supabase_payload_id = payload_id
            steps.append(StepResult(
                step="SUPABASE_SAVE_PAYLOAD",
                status="COMPLETED",
                duration_ms=int((time.time() - t0) * 1000),
                supabase_id=payload_id,
            ))
            logger.info("Saved analysis_payload: %s", payload_id)
        except Exception as exc:
            logger.error("Step 3 failed (Supabase save payload): %s", exc)
            self._store.update_status(session_id, "SUPABASE_SAVE_PAYLOAD", "FAILED", str(exc))
            result.status = "FAILED"
            result.error = f"Supabase payload save failed: {exc}"
            result.total_duration_ms = int((time.time() - pipeline_start) * 1000)
            steps.append(StepResult("SUPABASE_SAVE_PAYLOAD", "FAILED", error=str(exc)))
            result.steps = steps
            return result

        # ---- STEP 4: Call KRA HuggingFace Space --------------------- #
        self._store.update_status(session_id, "KRA_CALL", "IN_PROGRESS")
        t0 = time.time()
        kra_result: Dict[str, Any] = {}
        try:
            update_payload_status(payload_id, "processing")
            kra_result = self._kra.analyze(payload_id=payload_id)
            result.kra_raw = kra_result.get("raw_text", json.dumps(kra_result))
            steps.append(StepResult(
                step="KRA_CALL",
                status="COMPLETED",
                duration_ms=int((time.time() - t0) * 1000),
            ))
            update_payload_status(payload_id, "kra_done")
            logger.info("KRA call completed (%d chars)", len(result.kra_raw or ""))
        except Exception as exc:
            logger.error("Step 4 KRA call failed: %s", exc)
            self._store.update_status(session_id, "KRA_CALL", "FAILED", str(exc))
            result.status = "FAILED"
            result.error = f"KRA Space error: {exc}"
            result.total_duration_ms = int((time.time() - pipeline_start) * 1000)
            steps.append(StepResult("KRA_CALL", "FAILED", error=str(exc)))
            result.steps = steps
            return result

        # ---- STEP 5: Save KRA output to Supabase -------------------- #
        self._store.update_status(session_id, "SUPABASE_SAVE_KRA", "IN_PROGRESS")
        t0 = time.time()
        kra_output_id: Optional[str] = None
        try:
            kra_output_id, _ = save_kra_output(
                session_id=session_id,
                payload_id=payload_id,
                symptoms_text=symptoms_text,
                kra_result=kra_result,
            )
            self._store.set_supabase_ids(session_id, kra_id=kra_output_id)
            result.supabase_kra_id = kra_output_id
            steps.append(StepResult(
                step="SUPABASE_SAVE_KRA",
                status="COMPLETED",
                duration_ms=int((time.time() - t0) * 1000),
                supabase_id=kra_output_id,
            ))
            logger.info("Saved kra_output: %s", kra_output_id)
        except Exception as exc:
            logger.error("Step 5 Supabase KRA save failed: %s", exc)
            self._store.update_status(session_id, "SUPABASE_SAVE_KRA", "FAILED", str(exc))
            result.status = "PARTIAL"
            result.error = f"KRA output Supabase save failed: {exc}"
            result.total_duration_ms = int((time.time() - pipeline_start) * 1000)
            steps.append(StepResult("SUPABASE_SAVE_KRA", "FAILED", error=str(exc)))
            result.steps = steps
            return result

        # ---- STEP 6: Call ORA HuggingFace Space --------------------- #
        self._store.update_status(session_id, "ORA_CALL", "IN_PROGRESS")
        t0 = time.time()
        ora_result: Dict[str, Any] = {}
        try:
            ora_result = self._ora.refine(
                kra_output_id=kra_output_id,
                experience_level=experience_level,
            )
            refined = ora_result.get("refined_output", "")

            # Append rare-case alert to ORA output if triggered
            if rare_alert.triggered:
                refined += _format_rare_alert_block(rare_alert)

            result.refined_output = refined
            result.disclaimer = ora_result.get("disclaimer")
            steps.append(StepResult(
                step="ORA_CALL",
                status="COMPLETED",
                duration_ms=int((time.time() - t0) * 1000),
            ))
            logger.info("ORA call completed")
        except Exception as exc:
            logger.error("Step 6 ORA call failed: %s", exc)
            # Non-fatal — return KRA raw output as partial result
            result.refined_output = result.kra_raw or "ORA refinement unavailable."
            result.disclaimer = "[!] ORA refinement failed. Showing raw KRA output. Verify clinically."
            result.status = "PARTIAL"
            steps.append(StepResult("ORA_CALL", "FAILED", error=str(exc)))

        # ---- STEP 7: Save ORA output & finalise --------------------- #
        if result.refined_output:
            t0 = time.time()
            try:
                ora_output_id = save_ora_output(
                    session_id=session_id,
                    kra_output_id=kra_output_id,
                    experience_level=experience_level,
                    refined_output=result.refined_output or "",
                    disclaimer=result.disclaimer,
                    status=ora_result.get("status", "success"),
                )
                self._store.set_supabase_ids(session_id, ora_id=ora_output_id)
                result.supabase_ora_id = ora_output_id
                steps.append(StepResult(
                    step="SUPABASE_SAVE_ORA",
                    status="COMPLETED",
                    duration_ms=int((time.time() - t0) * 1000),
                    supabase_id=ora_output_id,
                ))
                update_payload_status(payload_id, "completed")
            except Exception as exc:
                logger.warning("Step 7 ORA Supabase save failed (non-fatal): %s", exc)
                steps.append(StepResult("SUPABASE_SAVE_ORA", "FAILED", error=str(exc)))

        total_ms = int((time.time() - pipeline_start) * 1000)
        if result.status == "IN_PROGRESS":
            result.status = "COMPLETED"

        self._store.update_status(session_id, "DONE", result.status)
        result.steps = steps
        result.total_duration_ms = total_ms

        logger.info(
            "Pipeline DONE session=%s status=%s total=%dms",
            session_id, result.status, total_ms,
        )
        return result
