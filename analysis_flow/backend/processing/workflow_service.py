from __future__ import annotations

import queue
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional

from backend.processing.kra_client import KRAClient
from backend.processing.ora_client import ORAClient
from backend.processing.search_service import SearchService
from backend.processing.supabase_payload import (
    get_patient_history_bundle,
    save_analysis_payload,
    save_kra_output,
    save_ora_output,
    update_payload_status,
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
        self._cancel_events: dict[str, threading.Event] = {}  # per-session cancel events
        self.event_bus = PipelineEventBus()

    def readiness_status(self) -> dict[str, bool]:
        """Non-blocking readiness check for local KRA and ORA models."""
        kra_ok = self._kra.health_check()
        ora_ok = self._ora.health_check()
        logger.info("Model readiness — KRA: %s  ORA: %s", kra_ok, ora_ok)
        return {"kra": kra_ok, "ora": ora_ok, "all_ready": kra_ok and ora_ok}

    def check_spaces_health(self) -> dict[str, bool]:
        """Backward-compatible alias for older callers."""
        return self.readiness_status()

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
            # Signal the cancel event so in-flight KRA/ORA SSE calls break immediately
            event = self._cancel_events.get(session_id)
            if event is not None:
                event.set()

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
            self._cancel_events.pop(session_id, None)

    def _get_or_create_cancel_event(self, session_id: str) -> threading.Event:
        """Return the per-session cancel event, creating it if necessary."""
        with self._cancel_lock:
            if session_id not in self._cancel_events:
                self._cancel_events[session_id] = threading.Event()
            return self._cancel_events[session_id]

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

        # Extract patient_id from session for Supabase threading
        patient_id = session.get("patient_id")

        try:
            return self._run_analysis_pipeline(
                session_id=session_id,
                experience_level=experience_level,
                extraction_payload=extraction_payload,
                ecg_payload=ecg_payload,
                lab_payload=lab_payload,
                started=started,
                patient_id=patient_id,
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

    def _save_payload_snapshot(
        self,
        *,
        session_id: str,
        symptoms_json: dict[str, Any],
        ecg_json: dict[str, Any],
        labs_json: dict[str, Any],
        context_text: str,
        quality: dict[str, Any],
        history_json: dict[str, Any],
        patient_id: Optional[str],
    ) -> dict[str, Any]:
        try:
            payload_id, payload_url = save_analysis_payload(
                session_id=session_id,
                symptoms=symptoms_json,
                ecg=ecg_json,
                labs=labs_json,
                context_text=context_text,
                quality=quality,
                patient_id=patient_id,
                history_json=history_json,
            )
            self._store.set_supabase_payload_id(session_id, payload_id)
            update_payload_status(payload_id, "processing")
            return {
                "payload_id": payload_id,
                "payload_url": payload_url,
                "supabase_available": True,
            }
        except Exception as exc:
            logger.warning(
                "Supabase payload persistence failed for %s: %s – continuing with local payload id",
                session_id,
                exc,
            )
            payload_id = str(uuid.uuid4())
            return {
                "payload_id": payload_id,
                "payload_url": None,
                "supabase_available": False,
                "error": str(exc),
            }

    def _save_kra_history_entry(
        self,
        *,
        session_id: str,
        payload_id: str,
        symptoms_text: str,
        kra_result: dict[str, Any],
        patient_id: Optional[str],
    ) -> dict[str, Any]:
        try:
            kra_id, kra_url = save_kra_output(
                session_id=session_id,
                payload_id=payload_id,
                symptoms_text=symptoms_text,
                kra_result=kra_result,
                patient_id=patient_id,
            )
            self._store.set_supabase_kra_id(session_id, kra_id)
            return {"kra_id": kra_id, "kra_url": kra_url, "supabase_available": True}
        except Exception as exc:
            logger.warning(
                "KRA history persistence failed for %s: %s – continuing with local KRA id",
                session_id,
                exc,
            )
            return {
                "kra_id": str(uuid.uuid4()),
                "kra_url": None,
                "supabase_available": False,
                "error": str(exc),
            }

    def _save_ora_history_entry(
        self,
        *,
        session_id: str,
        kra_output_id: str,
        experience_level: str,
        ora_result: dict[str, Any],
        patient_id: Optional[str],
    ) -> dict[str, Any]:
        try:
            ora_output_id, ora_url = save_ora_output(
                session_id=session_id,
                kra_output_id=kra_output_id,
                experience_level=experience_level,
                refined_output=ora_result.get("refined_output", ""),
                disclaimer=ora_result.get("disclaimer"),
                status=ora_result.get("status", "success"),
                patient_id=patient_id,
            )
            return {"ora_id": ora_output_id, "ora_url": ora_url, "supabase_available": True}
        except Exception as exc:
            logger.warning(
                "ORA history persistence failed for %s/%s: %s",
                session_id,
                experience_level,
                exc,
            )
            return {
                "ora_id": str(uuid.uuid4()),
                "ora_url": None,
                "supabase_available": False,
                "error": str(exc),
            }

    def _run_analysis_pipeline(
        self,
        session_id: str,
        experience_level: str,
        extraction_payload: dict[str, Any],
        ecg_payload: dict[str, Any],
        lab_payload: dict[str, Any],
        started: float,
        patient_id: Optional[str] = None,
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

        # ── Step 1: Textbook retrieval, then uncertainty-gated rare cases ───
        self._emit(session_id, "faiss_search", "started")
        retrieval_started = time.time()
        patient_vector = self._search.build_patient_vector(
            symptoms_text=symptoms_text,
            ecg_findings=ecg_findings,
            lab_findings=lab_findings,
            lab_values=lab_values,
        )
        textbook_context, quality = self._search.search_textbook(patient_vector, top_k=5)
        retrieval_ms = int((time.time() - retrieval_started) * 1000)
        quality = dict(quality)
        processing_steps.append(
            {
                "step": "faiss_search",
                "status": "success",
                "duration_ms": retrieval_ms,
                "rare_gate": quality.get("rare_search_gate"),
            }
        )
        self._emit(session_id, "faiss_search", "completed", duration_ms=retrieval_ms)
        self._raise_if_cancelled(session_id)

        context_sections: list[str] = [textbook_context] if textbook_context else []
        rare_context = ""
        rare_alert = self._search.rare_case_flag.evaluate(textbook_context or "", symptoms_text)
        rare_gate = self._search.should_search_rare_cases(
            symptoms_text=symptoms_text,
            textbook_context=textbook_context,
            quality=quality,
            ecg_findings=ecg_findings,
            lab_findings=lab_findings,
            lab_values=lab_values,
        )
        quality["rare_search_gate"] = rare_gate.get("reason")

        self._store.save_retrieval_context(
            session_id=session_id,
            source_type="books",
            content=textbook_context,
            metadata={
                "quality": quality,
                "experience_level": experience_level,
                "rare_search_gate": rare_gate,
            },
        )

        if rare_gate.get("triggered"):
            self._emit(session_id, "rare_case_search", "started")
            rare_started = time.time()
            rare_context, rare_quality, rare_alert = self._search.search_rare_cases(
                patient_vector,
                symptoms_text=symptoms_text,
            )
            rare_ms = int((time.time() - rare_started) * 1000)
            quality.update(rare_quality)
            if rare_context:
                context_sections.append(rare_context)
                self._store.save_retrieval_context(
                    session_id=session_id,
                    source_type="rare_cases",
                    content=rare_context,
                    metadata={
                        "rare_alert": rare_alert.to_dict(),
                        "rare_search_gate": rare_gate,
                        "rare_top_score": quality.get("rare_top_score"),
                    },
                    score=float(quality.get("rare_top_score", 0.0) or 0.0),
                )
            processing_steps.append(
                {
                    "step": "rare_case_search",
                    "status": "success",
                    "duration_ms": rare_ms,
                    "triggered": bool(rare_alert.triggered),
                    "top_score": float(quality.get("rare_top_score", 0.0) or 0.0),
                }
            )
            self._emit(
                session_id,
                "rare_case_search",
                "completed",
                duration_ms=rare_ms,
                triggered=bool(rare_alert.triggered),
                top_score=float(quality.get("rare_top_score", 0.0) or 0.0),
            )
        else:
            quality.setdefault("rare_cases_searched", 0)
            quality.setdefault("rare_top_score", 0.0)
            processing_steps.append(
                {
                    "step": "rare_case_search",
                    "status": "skipped",
                    "duration_ms": 0,
                    "reason": rare_gate.get("reason"),
                }
            )
            self._emit(
                session_id,
                "rare_case_search",
                "completed",
                duration_ms=0,
                triggered=False,
                skipped=True,
                reason=rare_gate.get("reason"),
            )
        self._raise_if_cancelled(session_id)

        context_text = "\n\n".join(section.strip() for section in context_sections if str(section).strip())

        # ── Step 2: Load longitudinal history summary for KRA only ──────────
        history_bundle = {"patient_id": patient_id, "summary": {}, "records": []}
        history_summary = {}
        history_summary_text = ""
        if patient_id:
            try:
                history_bundle = get_patient_history_bundle(patient_id)
            except Exception as exc:
                logger.warning("Patient history summary fetch failed for %s: %s", patient_id, exc)
        if isinstance(history_bundle, dict):
            history_summary = history_bundle.get("summary") or {}
        history_summary_text = str(history_summary.get("summary_text") or "").strip()

        # ── Step 3: Persist payload and run KRA in parallel ─────────────────
        cancel_event = self._get_or_create_cancel_event(session_id)
        self._emit(session_id, "supabase_save_payload", "started")
        self._emit(session_id, "kra_analysis", "started")

        def run_payload_save() -> dict[str, Any]:
            started_at = time.time()
            result = self._save_payload_snapshot(
                session_id=session_id,
                symptoms_json=symptoms_json,
                ecg_json=ecg_json,
                labs_json=labs_json,
                context_text=context_text,
                quality=quality,
                history_json=history_summary,
                patient_id=patient_id,
            )
            result["duration_ms"] = int((time.time() - started_at) * 1000)
            return result

        def run_kra_analysis() -> dict[str, Any]:
            started_at = time.time()
            result = self._kra.analyze(
                symptoms_text=symptoms_text,
                context_text=context_text,
                ecg_dict=ecg_json,
                labs_dict=labs_json,
                history_summary_text=history_summary_text,
                cancel_event=cancel_event,
            )
            return {
                "kra_result": result,
                "duration_ms": int((time.time() - started_at) * 1000),
            }

        with ThreadPoolExecutor(max_workers=2) as executor:
            payload_future = executor.submit(run_payload_save)
            kra_future = executor.submit(run_kra_analysis)
            payload_result = payload_future.result()
            self._raise_if_cancelled(session_id)
            kra_run = kra_future.result()

        payload_id = payload_result["payload_id"]
        payload_url = payload_result.get("payload_url")
        supabase_available = bool(payload_result.get("supabase_available"))
        payload_ms = int(payload_result.get("duration_ms") or 0)
        kra_result = kra_run["kra_result"]
        kra_ms = int(kra_run.get("duration_ms") or 0)

        processing_steps.append(
            {
                "step": "supabase_save_payload",
                "status": "success" if supabase_available else "offline_fallback",
                "duration_ms": payload_ms,
                "supabase_id": payload_id,
                "supabase_available": supabase_available,
            }
        )
        processing_steps.append(
            {
                "step": "kra_analysis",
                "status": "success",
                "duration_ms": kra_ms,
                "history_injected": bool(history_summary_text),
            }
        )
        self._emit(
            session_id,
            "supabase_save_payload",
            "completed",
            duration_ms=payload_ms,
            supabase_available=supabase_available,
        )
        self._emit(
            session_id,
            "kra_analysis",
            "completed",
            duration_ms=kra_ms,
            history_injected=bool(history_summary_text),
        )
        self._raise_if_cancelled(session_id)

        # ── Step 4: Persist KRA and run ORA directly from KRA in parallel ───
        requested_level = str(experience_level or "seasoned").strip().upper()
        if requested_level not in {"NEWBIE", "SEASONED"}:
            requested_level = "SEASONED"

        self._emit(session_id, "supabase_save_kra", "started")
        self._emit(session_id, "ora_refinement", "started")

        def run_kra_persist() -> dict[str, Any]:
            started_at = time.time()
            result = self._save_kra_history_entry(
                session_id=session_id,
                payload_id=payload_id,
                symptoms_text=symptoms_text,
                kra_result=kra_result,
                patient_id=patient_id,
            )
            result["duration_ms"] = int((time.time() - started_at) * 1000)
            return result

        def run_ora_refinement() -> dict[str, Any]:
            started_at = time.time()
            result = self._ora.refine(
                kra_result=kra_result,
                symptoms_text=symptoms_text,
                experience_level=requested_level,
                cancel_event=cancel_event,
            )
            return {
                "ora_result": result,
                "duration_ms": int((time.time() - started_at) * 1000),
            }

        with ThreadPoolExecutor(max_workers=2) as executor:
            kra_save_future = executor.submit(run_kra_persist)
            ora_future = executor.submit(run_ora_refinement)
            kra_save_result = kra_save_future.result()
            self._raise_if_cancelled(session_id)
            ora_run = ora_future.result()

        kra_id = kra_save_result["kra_id"]
        kra_url = kra_save_result.get("kra_url")
        kra_save_ms = int(kra_save_result.get("duration_ms") or 0)
        ora_result = ora_run["ora_result"]
        ora_ms = int(ora_run.get("duration_ms") or 0)
        supabase_available = supabase_available and bool(kra_save_result.get("supabase_available"))

        processing_steps.append(
            {
                "step": "supabase_save_kra",
                "status": "success" if kra_save_result.get("supabase_available") else "offline_fallback",
                "duration_ms": kra_save_ms,
                "supabase_id": kra_id,
            }
        )
        processing_steps.append(
            {
                "step": "ora_refinement",
                "status": ora_result.get("status", "success"),
                "duration_ms": ora_ms,
                "experience_level": requested_level.lower(),
            }
        )
        self._emit(
            session_id,
            "supabase_save_kra",
            "completed",
            duration_ms=kra_save_ms,
            supabase_available=bool(kra_save_result.get("supabase_available")),
        )
        self._emit(
            session_id,
            "ora_refinement",
            "completed",
            duration_ms=ora_ms,
            experience_level=requested_level.lower(),
        )
        self._raise_if_cancelled(session_id)

        # ── Step 5: Persist ORA history entry ────────────────────────────────
        self._emit(session_id, "supabase_save_ora", "started")
        ora_save_started = time.time()
        ora_save_result = self._save_ora_history_entry(
            session_id=session_id,
            kra_output_id=kra_id,
            experience_level=requested_level,
            ora_result=ora_result,
            patient_id=patient_id,
        )
        ora_save_ms = int((time.time() - ora_save_started) * 1000)
        selected_key = requested_level.lower()
        selected_ora_id = ora_save_result.get("ora_id") or ""
        selected_ora_url = ora_save_result.get("ora_url")
        supabase_available = supabase_available and bool(ora_save_result.get("supabase_available"))

        ora_outputs: dict[str, str] = {
            selected_key: ora_result.get("refined_output", ""),
        }
        ora_disclaimers: dict[str, str] = {
            selected_key: ora_result.get("disclaimer") or "",
        }

        processing_steps.append(
            {
                "step": "supabase_save_ora",
                "status": "success" if ora_save_result.get("supabase_available") else "offline_fallback",
                "duration_ms": ora_save_ms,
                "supabase_id": selected_ora_id,
            }
        )
        self._emit(
            session_id,
            "supabase_save_ora",
            "completed",
            duration_ms=ora_save_ms,
            supabase_available=bool(ora_save_result.get("supabase_available")),
        )
        self._raise_if_cancelled(session_id)

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
