from __future__ import annotations

import queue
import threading
import time
import uuid
from typing import Any, Optional

from backend.processing.kra_client import KRAClient
from backend.processing.ora_client import ORAClient
from backend.processing.search_service import SearchService
from backend.processing.supabase_payload import (
    save_analysis_payload,
    save_kra_output,
    save_ora_output,
    update_payload_status,
    check_existing_payload,
)
from backend.processing.workflow_state import WorkflowState
from backend.processing.workflow_store import WorkflowStore

import logging
logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
#  Pipeline Event Bus                                                          #
# --------------------------------------------------------------------------- #

class PipelineEventBus:
    """
    Thread-safe publish-subscribe bus for pipeline step events.
    The pipeline calls emit() from a thread-pool worker.
    SSE route handlers subscribe via subscribe() and read from queue.Queue.
    """

    def __init__(self) -> None:
        self._subscribers: dict[str, list[queue.Queue]] = {}
        self._lock = threading.Lock()

    def subscribe(self, session_id: str) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=100)
        with self._lock:
            self._subscribers.setdefault(session_id, []).append(q)
        return q

    def unsubscribe(self, session_id: str, q: queue.Queue) -> None:
        with self._lock:
            listeners = self._subscribers.get(session_id, [])
            if q in listeners:
                listeners.remove(q)
            if not listeners and session_id in self._subscribers:
                del self._subscribers[session_id]

    def emit(self, session_id: str, event: dict) -> None:
        """Broadcast to all listeners. Thread-safe, non-blocking."""
        with self._lock:
            queues = list(self._subscribers.get(session_id, []))
        for q in queues:
            try:
                q.put_nowait(event)
            except queue.Full:
                pass

    def close_session(self, session_id: str) -> None:
        """Signal EOF so SSE streams close gracefully."""
        self.emit(session_id, {"__eof__": True})


# Analysis can start from any of these states (ECG/Lab may be skipped)
_ANALYSIS_READY_STATES = {
    WorkflowState.EXTRACTION_DONE.value,
    WorkflowState.ECG_DONE.value,
    WorkflowState.LAB_DONE.value,
}


class WorkflowService:
    def __init__(self) -> None:
        self._store = WorkflowStore()
        self._search = SearchService()
        self._kra = KRAClient()
        self._ora = ORAClient()
        self._cancel_requested: set[str] = set()
        self._cancel_lock = threading.Lock()
        self.event_bus = PipelineEventBus()

    def check_spaces_health(self) -> dict[str, bool]:
        """Non-blocking health check for KRA and ORA HF Spaces."""
        kra_ok = self._kra.health_check()
        ora_ok = self._ora.health_check()
        logger.info("Space health — KRA: %s  ORA: %s", kra_ok, ora_ok)
        return {"kra": kra_ok, "ora": ora_ok}

    def request_stop_analysis(self, session_id: str) -> dict[str, Any]:
        """
        Signal the running pipeline to stop at the next checkpoint.

        Only sets a cancel flag — does NOT change session state.
        The pipeline thread detects the flag and rolls back state itself,
        avoiding any race condition between this handler and the worker thread.
        """
        session = self._store.get_session(session_id)
        if session is None:
            raise ValueError("SESSION_NOT_FOUND")

        with self._cancel_lock:
            self._cancel_requested.add(session_id)

        logger.info("Stop requested for session %s (current_state=%s)",
                    session_id, session["current_state"])

        return {
            "session_id": session_id,
            "state": session["current_state"],
            "status": "CANCEL_REQUESTED",
        }

    def _clear_cancel_request(self, session_id: str) -> None:
        with self._cancel_lock:
            self._cancel_requested.discard(session_id)

    def _raise_if_cancelled(self, session_id: str) -> None:
        with self._cancel_lock:
            cancelled = session_id in self._cancel_requested
        if cancelled:
            raise RuntimeError("ANALYSIS_CANCELLED")

    def run_analysis(self, session_id: str, experience_level: str = "seasoned") -> dict[str, Any]:
        self._clear_cancel_request(session_id)
        session = self._store.get_session(session_id)
        if session is None:
            raise ValueError("SESSION_NOT_FOUND")

        current_state = session["current_state"]

        # Reset a stuck ANALYSIS_RUNNING (previous crash without rollback)
        if current_state == WorkflowState.ANALYSIS_RUNNING.value:
            self._store.transition_state(
                session_id=session_id,
                next_state=WorkflowState.LAB_DONE,
                event_type="ANALYSIS_RETRY_RESET",
                message="Resetting stuck ANALYSIS_RUNNING state for retry",
            )
            current_state = WorkflowState.LAB_DONE.value

        # Allow re-run from ANALYSIS_DONE
        if current_state == WorkflowState.ANALYSIS_DONE.value:
            self._store.transition_state(
                session_id=session_id,
                next_state=WorkflowState.ANALYSIS_RUNNING,
                event_type="ANALYSIS_RERUN",
                message="Re-running analysis",
            )
            current_state = WorkflowState.ANALYSIS_RUNNING.value

        # Accept any ready state (handles ECG/Lab skip scenarios)
        if current_state not in _ANALYSIS_READY_STATES and current_state != WorkflowState.ANALYSIS_RUNNING.value:
            raise RuntimeError(f"INVALID_ANALYSIS_STATE:{current_state}")

        extraction = self._store.get_latest_step_payload(session_id, "extraction")
        ecg = self._store.get_latest_step_payload(session_id, "ecg")
        lab = self._store.get_latest_step_payload(session_id, "lab")

        if extraction is None:
            raise RuntimeError("MISSING_EXTRACTION_PAYLOAD")

        if current_state != WorkflowState.ANALYSIS_RUNNING.value:
            self._store.transition_state(
                session_id=session_id,
                next_state=WorkflowState.ANALYSIS_RUNNING,
                event_type="ANALYSIS_START",
                message="Phase B analysis started",
            )

        started = time.time()
        extraction_payload = extraction["payload"]
        ecg_payload = ecg["payload"] if ecg is not None else {"result": {"status": "skipped", "reason": "not_submitted"}}
        lab_payload = lab["payload"] if lab is not None else {"result": {"status": "skipped", "reason": "not_submitted"}}

        try:
            return self._run_analysis_pipeline(
                session_id=session_id,
                experience_level=experience_level,
                extraction_payload=extraction_payload,
                ecg_payload=ecg_payload,
                lab_payload=lab_payload,
                started=started,
            )
        except RuntimeError as exc:
            if "ANALYSIS_CANCELLED" in str(exc):
                try:
                    self._store.transition_state(
                        session_id=session_id,
                        next_state=WorkflowState.LAB_DONE,
                        event_type="ANALYSIS_CANCELLED",
                        message="Analysis cancelled by user",
                    )
                except Exception:
                    pass
                self.event_bus.emit(session_id, {"step": "cancelled", "status": "cancelled"})
                raise
            else:
                try:
                    self._store.transition_state(
                        session_id=session_id,
                        next_state=WorkflowState.LAB_DONE,
                        event_type="ANALYSIS_ROLLBACK",
                        message=f"Pipeline failed: {exc}",
                    )
                except Exception:
                    pass
                raise
        except Exception as exc:
            try:
                self._store.transition_state(
                    session_id=session_id,
                    next_state=WorkflowState.LAB_DONE,
                    event_type="ANALYSIS_ROLLBACK",
                    message=f"Pipeline failed: {exc}",
                )
            except Exception:
                pass
            raise
        finally:
            self._clear_cancel_request(session_id)
            self.event_bus.close_session(session_id)

    def _emit(self, session_id: str, step: str, status: str, **kwargs: Any) -> None:
        self.event_bus.emit(session_id, {"step": step, "status": status, **kwargs})

    def _run_analysis_pipeline(
        self,
        session_id: str,
        experience_level: str,
        extraction_payload: dict[str, Any],
        ecg_payload: dict[str, Any],
        lab_payload: dict[str, Any],
        started: float,
    ) -> dict[str, Any]:
        processing_steps: list[dict[str, Any]] = []
        self._raise_if_cancelled(session_id)

        # ── Step 0: Normalise inputs ──────────────────────────────────────────
        symptoms_json, symptoms_text = self._normalize_symptoms_payload(extraction_payload)
        ecg_json = self._normalize_ecg_payload(ecg_payload)
        labs_json = self._normalize_lab_payload(lab_payload)

        ecg_findings: list[str] = ecg_json.get("findings", []) if ecg_json.get("status") == "present" else []
        lab_findings: list[str] = labs_json.get("findings", []) if labs_json.get("status") == "present" else []
        lab_values: dict[str, float] = {
            marker: value
            for marker, value in {
                "troponin": labs_json.get("troponin"),
                "ldh": labs_json.get("ldh"),
                "bnp": labs_json.get("bnp"),
                "creatinine": labs_json.get("creatinine"),
                "hemoglobin": labs_json.get("hemoglobin"),
            }.items()
            if isinstance(value, (int, float))
        }
        self._emit(session_id, "session_init", "completed")

        # ── Step 1: FAISS / rare-case retrieval ──────────────────────────────
        self._emit(session_id, "faiss_search", "started")
        retrieval_started = time.time()
        context_text, quality, rare_alert = self._search.search(
            symptoms_text=symptoms_text,
            top_k=5,
            include_rare=True,
            ecg_findings=ecg_findings,
            lab_findings=lab_findings,
            lab_values=lab_values,
        )
        retrieval_ms = int((time.time() - retrieval_started) * 1000)
        processing_steps.append(
            {
                "step": "dual_local_retrieval",
                "status": "success",
                "duration_ms": retrieval_ms,
            }
        )
        self._emit(session_id, "faiss_search", "completed", duration_ms=retrieval_ms)
        self._raise_if_cancelled(session_id)

        self._store.save_retrieval_context(
            session_id=session_id,
            source_type="books",
            content=context_text,
            metadata={
                "quality": quality,
                "experience_level": experience_level,
            },
        )

        if quality.get("rare_cases_searched", 0):
            self._store.save_retrieval_context(
                session_id=session_id,
                source_type="rare_cases",
                content=context_text,
                metadata={
                    "rare_alert": rare_alert.to_dict(),
                    "rare_top_score": quality.get("rare_top_score"),
                },
                score=float(quality.get("rare_top_score", 0.0) or 0.0),
            )
            self._emit(session_id, "rare_case_search", "completed",
                       triggered=bool(rare_alert.triggered),
                       top_score=float(quality.get("rare_top_score", 0.0) or 0.0))

        # ── Step 2: Supabase payload save (with local fallback) ───────────────
        supabase_available = True
        payload_url: str | None = None
        inline_payload: dict[str, Any] = {
            "session_id": session_id,
            "symptoms": symptoms_json,
            "ecg": ecg_json,
            "labs": labs_json,
            "context_text": context_text,
            "quality": quality,
        }

        self._emit(session_id, "supabase_save_payload", "started")
        payload_started = time.time()

        # Idempotency: reuse an existing payload for this session if present.
        existing_id = check_existing_payload(session_id)
        if existing_id:
            payload_id = existing_id
            payload_url = None
            self._store.set_supabase_payload_id(session_id, payload_id)
            update_payload_status(payload_id, "processing")
        else:
            try:
                payload_id, payload_url = save_analysis_payload(
                    session_id=session_id,
                    symptoms=symptoms_json,
                    ecg=ecg_json,
                    labs=labs_json,
                    context_text=context_text,
                    quality=quality,
                )
                self._store.set_supabase_payload_id(session_id, payload_id)
                update_payload_status(payload_id, "processing")
            except Exception as exc:  # Supabase unavailable → fall back to local UUID
                import logging as _logging
                _logging.getLogger(__name__).warning(
                    "Supabase save_analysis_payload failed for %s: %s – running in offline mode",
                    session_id, exc
                )
                payload_id = str(uuid.uuid4())
                supabase_available = False

        payload_ms = int((time.time() - payload_started) * 1000)
        processing_steps.append(
            {
                "step": "supabase_save_payload",
                "status": "success" if supabase_available else "offline_fallback",
                "duration_ms": payload_ms,
                "supabase_id": payload_id,
                "supabase_available": supabase_available,
            }
        )
        self._emit(session_id, "supabase_save_payload", "completed",
                   duration_ms=payload_ms, supabase_available=supabase_available)
        self._raise_if_cancelled(session_id)

        # ── Step 3: KRA via HF Space (or local fallback) ─────────────────────
        self._emit(session_id, "kra_analysis", "started")
        kra_started = time.time()
        kra_result = self._kra.analyze(
            payload_id=payload_id,
            supabase_available=supabase_available,
            inline_payload=inline_payload if not supabase_available else None,
        )
        kra_ms = int((time.time() - kra_started) * 1000)

        try:
            kra_id, kra_url = save_kra_output(
                session_id=session_id,
                payload_id=payload_id,
                symptoms_text=symptoms_text,
                kra_result=kra_result,
            )
            self._store.set_supabase_kra_id(session_id, kra_id)
        except Exception as exc:
            import logging as _logging
            _logging.getLogger(__name__).warning(
                "save_kra_output failed for %s: %s – using local id", session_id, exc
            )
            kra_id = str(uuid.uuid4())
            kra_url = None
            supabase_available = False

        processing_steps.append(
            {
                "step": "kra_analysis",
                "status": "success",
                "duration_ms": kra_ms,
                "supabase_id": kra_id,
            }
        )
        self._emit(session_id, "kra_analysis", "completed", duration_ms=kra_ms)
        self._raise_if_cancelled(session_id)

        # ── Step 4: ORA refinement via HF Space (or local fallback) ──────────
        ora_ids: dict[str, str] = {}
        ora_urls: dict[str, str | None] = {}
        ora_outputs: dict[str, str] = {}
        ora_disclaimers: dict[str, str] = {}

        requested_level = str(experience_level or "seasoned").strip().upper()
        if requested_level not in {"NEWBIE", "SEASONED", "EXPERT"}:
            requested_level = "SEASONED"

        for level in (requested_level,):
            self._emit(session_id, f"ora_refinement_{level.lower()}", "started")
            ora_started = time.time()
            ora_result = self._ora.refine(
                kra_output_id=kra_id,
                experience_level=level,
                supabase_available=supabase_available,
                inline_kra_result=kra_result if not supabase_available else None,
                symptoms_text=symptoms_text,
            )
            ora_ms = int((time.time() - ora_started) * 1000)

            try:
                ora_output_id, ora_url = save_ora_output(
                    session_id=session_id,
                    kra_output_id=kra_id,
                    experience_level=level,
                    refined_output=ora_result.get("refined_output", ""),
                    disclaimer=ora_result.get("disclaimer"),
                    status=ora_result.get("status", "success"),
                )
            except Exception as exc:
                import logging as _logging
                _logging.getLogger(__name__).warning(
                    "save_ora_output failed for %s/%s: %s", session_id, level, exc
                )
                ora_output_id = str(uuid.uuid4())
                ora_url = None

            ora_ids[level.lower()] = ora_output_id
            ora_urls[level.lower()] = ora_url
            ora_outputs[level.lower()] = ora_result.get("refined_output", "")
            ora_disclaimers[level.lower()] = ora_result.get("disclaimer") or ""
            processing_steps.append(
                {
                    "step": f"ora_refinement_{level.lower()}",
                    "status": "success",
                    "duration_ms": ora_ms,
                    "supabase_id": ora_output_id,
                }
            )
            self._emit(session_id, f"ora_refinement_{level.lower()}", "completed", duration_ms=ora_ms)
            self._raise_if_cancelled(session_id)

        selected_key = requested_level.lower()
        selected_ora_id = ora_ids.get(selected_key) or ora_ids.get("expert") or ora_ids.get("newbie") or ""
        selected_ora_url = ora_urls.get(selected_key) or ora_urls.get("expert") or ora_urls.get("newbie")

        # Frontend compatibility: expose SEASONED under the "expert" alias if needed.
        if "seasoned" in ora_outputs and "expert" not in ora_outputs:
            ora_outputs["expert"] = ora_outputs["seasoned"]
            ora_disclaimers["expert"] = ora_disclaimers.get("seasoned", "")

        self._store.set_supabase_ora_id(session_id, selected_ora_id)
        if supabase_available:
            try:
                update_payload_status(payload_id, "completed")
            except Exception:
                pass

        self._store.transition_state(
            session_id=session_id,
            next_state=WorkflowState.ANALYSIS_DONE,
            event_type="ANALYSIS_COMPLETE",
            message="Phase C complete: retrieval + payload + KRA/ORA chaining persisted",
        )
        self._emit(session_id, "analysis_done", "completed")

        elapsed_ms = int((time.time() - started) * 1000)
        return {
            "session_id": session_id,
            "status": "COMPLETED",
            "experience_level": experience_level,
            "supabase_available": supabase_available,
            "supabase_payload_id": payload_id,
            "supabase_payload_url": payload_url,
            "supabase_kra_id": kra_id,
            "supabase_kra_url": kra_url,
            "supabase_ora_id": selected_ora_id,
            "supabase_ora_url": selected_ora_url,
            "processing_steps": processing_steps,
            "kra_raw": kra_result.get("raw_text", ""),
            "ora_outputs": ora_outputs,
            "ora_disclaimers": ora_disclaimers,
            "refined_output": ora_outputs.get(selected_key) or ora_outputs.get("newbie") or ora_outputs.get("expert") or "",
            "disclaimer": ora_disclaimers.get(selected_key) or ora_disclaimers.get("newbie") or ora_disclaimers.get("expert") or "",
            "rare_case_alert": rare_alert.to_dict() if rare_alert.triggered else None,
            "total_duration_ms": elapsed_ms,
            "context_preview": context_text[:1200],
        }

    @staticmethod
    def _to_float(value: Any) -> Optional[float]:
        try:
            if value is None or value == "":
                return None
            return float(value)
        except (TypeError, ValueError):
            return None

    def _normalize_symptoms_payload(self, extraction_payload: dict[str, Any]) -> tuple[dict[str, Any], str]:
        symptoms = extraction_payload.get("symptoms", []) or []
        risk_factors = extraction_payload.get("risk_factors", []) or []
        translated = str(extraction_payload.get("translated_text") or "").strip()

        chief_complaint = str(symptoms[0]).strip() if symptoms else None
        symptoms_text = translated
        if not symptoms_text:
            if symptoms:
                symptoms_text = "Presenting symptoms: " + ", ".join(map(str, symptoms))
            else:
                symptoms_text = "No symptom narrative provided"
        if risk_factors:
            symptoms_text += f"\nRisk factors: {', '.join(map(str, risk_factors))}"

        symptoms_json = {
            "text": symptoms_text,
            "chief_complaint": chief_complaint,
            "additional": {
                "symptoms": symptoms,
                "risk_factors": risk_factors,
                "translated_text": translated,
                "symptom_count": len(symptoms),
                "risk_factor_count": len(risk_factors),
            },
        }
        return symptoms_json, symptoms_text

    def _normalize_ecg_payload(self, ecg_payload: dict[str, Any]) -> dict[str, Any]:
        raw = ecg_payload.get("result", {}) if isinstance(ecg_payload, dict) else {}
        if not isinstance(raw, dict):
            raw = {}

        status = str(raw.get("status") or "present").lower()
        if status in {"skipped", "error"}:
            return {
                "status": status,
                "raw": raw,
            }

        rhythm_analysis = raw.get("rhythm_analysis", {}) or {}
        abnormalities = raw.get("abnormalities", {}) or {}
        diagnosis = raw.get("diagnosis", {}) or {}

        findings: list[str] = []
        for item in (abnormalities.get("abnormalities", []) or []):
            if item:
                findings.append(str(item))
        severity = abnormalities.get("severity")
        if severity:
            findings.append(f"severity={severity}")
        for item in (diagnosis.get("differential_diagnoses", []) or []):
            if item:
                findings.append(str(item))
        for item in (diagnosis.get("recommendations", []) or []):
            if item:
                findings.append(str(item))
        for item in (raw.get("findings", []) or []):
            if item:
                findings.append(str(item))

        rhythm = raw.get("rhythm") or rhythm_analysis.get("rhythm_type")
        heart_rate_raw = raw.get("heart_rate") or rhythm_analysis.get("heart_rate")
        heart_rate_val = self._to_float(heart_rate_raw)
        heart_rate = int(heart_rate_val) if heart_rate_val is not None else None
        interpretation = raw.get("interpretation") or diagnosis.get("primary_diagnosis")
        st_segment = raw.get("st_segment")

        return {
            "status": "present",
            "rhythm": rhythm,
            "heart_rate": heart_rate,
            "st_segment": st_segment,
            "interpretation": interpretation,
            "findings": findings,
            "raw": raw,
        }

    def _normalize_lab_payload(self, lab_payload: dict[str, Any]) -> dict[str, Any]:
        raw = lab_payload.get("result", {}) if isinstance(lab_payload, dict) else {}
        if not isinstance(raw, dict):
            raw = {}

        status = str(raw.get("status") or "present").lower()
        if status in {"skipped", "error"}:
            return {
                "status": status,
                "raw": raw,
            }

        comparisons = raw.get("labComparison", []) or []
        findings: list[str] = []
        for item in comparisons:
            if not isinstance(item, dict):
                continue
            item_status = str(item.get("status", "")).lower()
            test = str(item.get("test", "")).strip()
            actual = item.get("actualValue")
            if test and item_status and item_status != "normal":
                findings.append(f"{test}: {actual} ({item_status})")

        group1 = raw.get("extractedJsonGroup1", {}) or {}
        group2 = raw.get("extractedJsonGroup2", {}) or {}

        def _pick(*keys: str) -> Optional[float]:
            for key in keys:
                value = self._to_float(group1.get(key))
                if value is not None:
                    return value
                value = self._to_float(group2.get(key))
                if value is not None:
                    return value
                value = self._to_float(raw.get(key))
                if value is not None:
                    return value
            return None

        return {
            "status": "present",
            "troponin": _pick("troponin", "Troponin"),
            "ldh": _pick("ldh", "LDH"),
            "bnp": _pick("bnp", "BNP"),
            "creatinine": _pick("creatinine", "Creatinine", "Cr"),
            "hemoglobin": _pick("hemoglobin", "Hemoglobin", "Hb"),
            "findings": findings,
            "raw": raw,
        }
