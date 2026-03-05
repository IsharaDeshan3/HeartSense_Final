from __future__ import annotations

import time
from typing import Any, Optional

from backend.processing.kra_client import KRAClient
from backend.processing.ora_client import ORAClient
from backend.processing.search_service import SearchService
from backend.processing.supabase_payload import (
    save_analysis_payload,
    save_kra_output,
    save_ora_output,
    update_payload_status,
)
from backend.processing.workflow_state import WorkflowState
from backend.processing.workflow_store import WorkflowStore


class WorkflowService:
    def __init__(self) -> None:
        self._store = WorkflowStore()
        self._search = SearchService()
        self._kra = KRAClient()
        self._ora = ORAClient()

    def run_analysis(self, session_id: str, experience_level: str = "seasoned") -> dict[str, Any]:
        session = self._store.get_session(session_id)
        if session is None:
            raise ValueError("SESSION_NOT_FOUND")

        current_state = session["current_state"]

        # Allow retry from a stuck ANALYSIS_RUNNING state (reset to LAB_DONE first)
        if current_state == WorkflowState.ANALYSIS_RUNNING.value:
            self._store.transition_state(
                session_id=session_id,
                next_state=WorkflowState.LAB_DONE,
                event_type="ANALYSIS_RETRY_RESET",
                message="Resetting stuck ANALYSIS_RUNNING state for retry",
            )
            current_state = WorkflowState.LAB_DONE.value

        if current_state != WorkflowState.LAB_DONE.value:
            raise RuntimeError(f"INVALID_ANALYSIS_STATE:{current_state}")

        extraction = self._store.get_latest_step_payload(session_id, "extraction")
        ecg = self._store.get_latest_step_payload(session_id, "ecg")
        lab = self._store.get_latest_step_payload(session_id, "lab")

        if extraction is None:
            raise RuntimeError("MISSING_EXTRACTION_PAYLOAD")

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
        except Exception:
            # Rollback state so the user can retry
            try:
                self._store.transition_state(
                    session_id=session_id,
                    next_state=WorkflowState.LAB_DONE,
                    event_type="ANALYSIS_ROLLBACK",
                    message="Analysis pipeline failed – rolled back to LAB_DONE",
                )
            except Exception:
                pass  # best-effort rollback
            raise

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

        retrieval_started = time.time()
        context_text, quality, rare_alert = self._search.search(
            symptoms_text=symptoms_text,
            top_k=5,
            include_rare=True,
            ecg_findings=ecg_findings,
            lab_findings=lab_findings,
            lab_values=lab_values,
        )
        processing_steps.append(
            {
                "step": "dual_local_retrieval",
                "status": "success",
                "duration_ms": int((time.time() - retrieval_started) * 1000),
            }
        )

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

        payload_started = time.time()
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
        processing_steps.append(
            {
                "step": "supabase_save_payload",
                "status": "success",
                "duration_ms": int((time.time() - payload_started) * 1000),
                "supabase_id": payload_id,
            }
        )

        kra_started = time.time()
        kra_result = self._kra.analyze(payload_id=payload_id)
        kra_id, kra_url = save_kra_output(
            session_id=session_id,
            payload_id=payload_id,
            symptoms_text=symptoms_text,
            kra_result=kra_result,
        )
        self._store.set_supabase_kra_id(session_id, kra_id)
        processing_steps.append(
            {
                "step": "kra_analysis",
                "status": "success",
                "duration_ms": int((time.time() - kra_started) * 1000),
                "supabase_id": kra_id,
            }
        )

        ora_ids: dict[str, str] = {}
        ora_outputs: dict[str, str] = {}
        ora_disclaimers: dict[str, str] = {}

        for level in ("NEWBIE", "EXPERT"):
            ora_started = time.time()
            ora_result = self._ora.refine(
                kra_output_id=kra_id,
                experience_level=level,
            )
            ora_output_id, ora_url = save_ora_output(
                session_id=session_id,
                kra_output_id=kra_id,
                experience_level=level,
                refined_output=ora_result.get("refined_output", ""),
                disclaimer=ora_result.get("disclaimer"),
                status=ora_result.get("status", "success"),
            )
            ora_ids[level.lower()] = ora_output_id
            ora_ids[f"{level.lower()}_url"] = ora_url
            ora_outputs[level.lower()] = ora_result.get("refined_output", "")
            ora_disclaimers[level.lower()] = ora_result.get("disclaimer") or ""
            processing_steps.append(
                {
                    "step": f"ora_refinement_{level.lower()}",
                    "status": "success",
                    "duration_ms": int((time.time() - ora_started) * 1000),
                    "supabase_id": ora_output_id,
                }
            )

        self._store.set_supabase_ora_id(session_id, ora_ids.get("expert") or ora_ids.get("newbie") or "")
        update_payload_status(payload_id, "completed")

        self._store.transition_state(
            session_id=session_id,
            next_state=WorkflowState.ANALYSIS_DONE,
            event_type="ANALYSIS_COMPLETE",
            message="Phase C complete: retrieval + payload + KRA/ORA chaining persisted",
        )

        elapsed_ms = int((time.time() - started) * 1000)
        return {
            "session_id": session_id,
            "status": "COMPLETED",
            "experience_level": experience_level,
            "supabase_payload_id": payload_id,
            "supabase_payload_url": payload_url,
            "supabase_kra_id": kra_id,
            "supabase_kra_url": kra_url,
            "supabase_ora_id": ora_ids.get("expert") or ora_ids.get("newbie"),
            "supabase_ora_url": ora_ids.get("expert_url") or ora_ids.get("newbie_url"),
            "processing_steps": processing_steps,
            "kra_raw": kra_result.get("raw_text", ""),
            "ora_outputs": ora_outputs,
            "ora_disclaimers": ora_disclaimers,
            "refined_output": ora_outputs.get("newbie") or ora_outputs.get("expert") or "",
            "disclaimer": ora_disclaimers.get("newbie") or ora_disclaimers.get("expert") or "",
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
