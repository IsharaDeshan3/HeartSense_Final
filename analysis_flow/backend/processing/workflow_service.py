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
        if current_state != WorkflowState.LAB_DONE.value:
            raise RuntimeError(f"INVALID_ANALYSIS_STATE:{current_state}")

        extraction = self._store.get_latest_step_payload(session_id, "extraction")
        ecg = self._store.get_latest_step_payload(session_id, "ecg")
        lab = self._store.get_latest_step_payload(session_id, "lab")

        if extraction is None or ecg is None or lab is None:
            raise RuntimeError("MISSING_STEP_PAYLOADS")

        self._store.transition_state(
            session_id=session_id,
            next_state=WorkflowState.ANALYSIS_RUNNING,
            event_type="ANALYSIS_START",
            message="Phase B analysis started",
        )

        started = time.time()
        processing_steps: list[dict[str, Any]] = []

        extraction_payload = extraction["payload"]
        ecg_payload = ecg["payload"]
        lab_payload = lab["payload"]

        symptoms = extraction_payload.get("symptoms", [])
        risk_factors = extraction_payload.get("risk_factors", [])
        translated = extraction_payload.get("translated_text") or ""

        symptoms_text = translated.strip()
        if not symptoms_text:
            symptoms_text = "Symptoms: " + ", ".join(symptoms)
        if risk_factors:
            symptoms_text += f"\nRisk factors: {', '.join(risk_factors)}"

        ecg_result = ecg_payload.get("result", {})
        lab_result = lab_payload.get("result", {})

        ecg_findings: list[str] = []
        abnormalities = ecg_result.get("abnormalities", {})
        diagnosis = ecg_result.get("diagnosis", {})
        if isinstance(abnormalities, dict):
            ecg_findings.extend(abnormalities.get("abnormalities", []) or [])
            severity = abnormalities.get("severity")
            if severity:
                ecg_findings.append(f"severity={severity}")
        if isinstance(diagnosis, dict):
            primary = diagnosis.get("primary_diagnosis")
            if primary:
                ecg_findings.append(str(primary))

        lab_findings: list[str] = []
        lab_values: dict[str, float] = {}

        if isinstance(lab_result, dict):
            comparisons = lab_result.get("labComparison", []) or []
            for item in comparisons:
                if not isinstance(item, dict):
                    continue
                status = str(item.get("status", "")).lower()
                test = str(item.get("test", "")).strip()
                val = item.get("actualValue")
                if status != "normal" and test:
                    lab_findings.append(f"{test}: {val} ({status})")

            g1 = lab_result.get("extractedJsonGroup1", {}) or {}
            marker_map = {
                "troponin": ["troponin", "Troponin"],
                "ldh": ["LDH", "ldh"],
                "bnp": ["BNP", "bnp"],
                "creatinine": ["Cr", "creatinine", "Creatinine"],
                "hemoglobin": ["Hemoglobin", "Hb", "hemoglobin"],
            }
            for marker, aliases in marker_map.items():
                value: Optional[float] = None
                for alias in aliases:
                    raw_val = g1.get(alias)
                    if raw_val is None:
                        continue
                    try:
                        value = float(raw_val)
                        break
                    except (TypeError, ValueError):
                        continue
                if value is not None:
                    lab_values[marker] = value

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
            symptoms={
                "symptoms": symptoms,
                "risk_factors": risk_factors,
                "translated_text": translated,
                "symptoms_text": symptoms_text,
            },
            ecg=ecg_result,
            labs=lab_result,
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
        kra_id, _ = save_kra_output(
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
            ora_output_id = save_ora_output(
                session_id=session_id,
                kra_output_id=kra_id,
                experience_level=level,
                refined_output=ora_result.get("refined_output", ""),
                disclaimer=ora_result.get("disclaimer"),
                status=ora_result.get("status", "success"),
            )
            ora_ids[level.lower()] = ora_output_id
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
            "supabase_kra_id": kra_id,
            "supabase_ora_id": ora_ids.get("expert") or ora_ids.get("newbie"),
            "supabase_payload_url": payload_url,
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
