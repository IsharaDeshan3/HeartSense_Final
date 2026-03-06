"""
backend/processing/supabase_payload.py

Supabase CRUD helpers for the 3 pipeline tables:
  - analysis_payloads  (step 3)
  - kra_outputs        (step 5)
  - ora_outputs        (step 7 -- local save, optional)

Uses direct requests to PostgREST API (no supabase SDK needed).
All methods use the SERVICE role key so RLS never blocks them.
"""

from __future__ import annotations

import json
import logging
import os
import requests
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())
logger = logging.getLogger(__name__)


# --------------------------------------------------------------------- #
#  PostgREST helper                                                      #
# --------------------------------------------------------------------- #

_base_url: Optional[str] = None
_headers: Optional[Dict[str, str]] = None


def _init():
    global _base_url, _headers
    if _base_url is not None:
        return
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        raise ValueError(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment. "
            "Check your .env file."
        )
    _base_url = url.rstrip("/")
    _headers = {
        "apikey": key,
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _post(table: str, row: Dict[str, Any]) -> Dict[str, Any]:
    """Insert a row and return the inserted data."""
    _init()
    url = f"{_base_url}/rest/v1/{table}"
    resp = requests.post(url, headers=_headers, json=row, timeout=30)
    if resp.status_code >= 400:
        detail = resp.text[:500]
        # Detect missing-column errors and provide actionable guidance
        if "does not exist" in detail or "could not find" in detail.lower():
            logger.error(
                "Supabase INSERT into '%s' failed – column(s) missing. "
                "Run the migration script: backend/database/migration_add_columns.sql "
                "in the Supabase SQL Editor.  Detail: %s  |  row keys: %s",
                table, detail, list(row.keys()),
            )
        else:
            logger.error(
                "Supabase INSERT into '%s' failed (HTTP %s): %s  |  row keys: %s",
                table, resp.status_code, detail, list(row.keys()),
            )
        resp.raise_for_status()
    data = resp.json()
    if not data:
        raise RuntimeError(f"Supabase insert {table} returned empty response")
    return data[0]


def _patch(table: str, values: Dict[str, Any], eq_col: str, eq_val: str) -> None:
    """Update rows matching a filter."""
    _init()
    url = f"{_base_url}/rest/v1/{table}?{eq_col}=eq.{eq_val}"
    resp = requests.patch(url, headers=_headers, json=values, timeout=30)
    resp.raise_for_status()


def _get(table: str, query_params: str, single: bool = False) -> Any:
    """Select rows with optional PostgREST query string."""
    _init()
    url = f"{_base_url}/rest/v1/{table}?{query_params}"
    resp = requests.get(url, headers=_headers, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if single:
        return data[0] if data else None
    return data


# --------------------------------------------------------------------- #
#  analysis_payloads                                                      #
# --------------------------------------------------------------------- #

def check_existing_payload(session_id: str) -> Optional[str]:
    """
    Return the Supabase row-id of an already-saved analysis_payload for
    *session_id*, or None if no such row exists.

    Used by the pipeline to implement idempotent saves: if a payload was
    already saved (e.g. the pipeline was retried after a transient error)
    we reuse the existing id instead of creating a duplicate row.
    """
    try:
        _init()
        row = _get(
            "analysis_payloads",
            f"session_id=eq.{session_id}&select=id&limit=1",
            single=True,
        )
        return str(row["id"]) if row else None
    except Exception as exc:
        logger.warning("check_existing_payload(%s) failed: %s – treating as not found", session_id, exc)
        return None


def save_analysis_payload(
    session_id: str,
    symptoms: Dict[str, Any],
    ecg: Optional[Dict[str, Any]],
    labs: Optional[Dict[str, Any]],
    context_text: str,
    quality: Optional[Dict[str, Any]] = None,
    patient_id: Optional[str] = None,
    history_json: Optional[Dict[str, Any]] = None,
) -> Tuple[str, str]:
    """
    Insert raw patient inputs + FAISS context into `analysis_payloads`.

    Returns:
        (row_id, public_url)
    """
    row = {
        "session_id": session_id,
        "symptoms_json": symptoms,
        "history_json": history_json or {},
        "ecg_json": ecg if ecg is not None else {},
        "labs_json": labs if labs is not None else {},
        "context_text": context_text,
        "quality_json": quality or {},
        "status": "pending",
    }
    if patient_id:
        row["patient_id"] = patient_id

    inserted = _post("analysis_payloads", row)
    row_id: str = str(inserted["id"])
    _init()
    public_url = f"{_base_url}/rest/v1/analysis_payloads?id=eq.{row_id}"

    logger.info("Saved analysis_payload row_id=%s patient_id=%s", row_id, patient_id)
    return row_id, public_url


def update_payload_status(payload_id: str, status: str) -> None:
    """Mark a payload row as 'processing' or 'completed'."""
    _patch("analysis_payloads", {"status": status}, "id", payload_id)


# --------------------------------------------------------------------- #
#  kra_outputs                                                            #
# --------------------------------------------------------------------- #

def save_kra_output(
    session_id: str,
    payload_id: str,
    symptoms_text: str,
    kra_result: Any,
    patient_id: Optional[str] = None,
) -> Tuple[str, str]:
    """
    Insert KRA agent output into `kra_outputs`.

    Returns:
        (row_id, public_url) pointing to the new kra_outputs row.
    """
    if isinstance(kra_result, str):
        kra_output_dict: Dict[str, Any] = {}
        raw_text: Optional[str] = kra_result
    else:
        kra_output_dict = kra_result
        raw_text = kra_result.get("raw_text")

    row = {
        "session_id": session_id,
        "payload_id": payload_id,
        "symptoms_text": symptoms_text,
        "kra_output": kra_output_dict,
        "raw_text": raw_text,
    }
    if patient_id:
        row["patient_id"] = patient_id

    inserted = _post("kra_outputs", row)
    row_id: str = str(inserted["id"])
    _init()
    public_url = f"{_base_url}/rest/v1/kra_outputs?id=eq.{row_id}"

    logger.info("Saved kra_output row_id=%s patient_id=%s", row_id, patient_id)
    return row_id, public_url


def get_kra_output(kra_output_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a kra_outputs row by ID (used for polling / debugging)."""
    return _get("kra_outputs", f"id=eq.{kra_output_id}&select=*", single=True)


# --------------------------------------------------------------------- #
#  ora_outputs                                                            #
# --------------------------------------------------------------------- #

def save_ora_output(
    session_id: str,
    kra_output_id: str,
    experience_level: str,
    refined_output: str,
    disclaimer: Optional[str],
    status: str = "success",
    patient_id: Optional[str] = None,
) -> Tuple[str, str]:
    """
    Insert ORA agent output into `ora_outputs`.

    Returns:
        (row_id, public_url) of the inserted row.
    """
    row = {
        "session_id": session_id,
        "kra_output_id": kra_output_id,
        "experience_level": experience_level,
        "refined_output": refined_output,
        "disclaimer": disclaimer,
        "status": status,
    }
    if patient_id:
        row["patient_id"] = patient_id

    inserted = _post("ora_outputs", row)
    row_id: str = str(inserted["id"])
    _init()
    public_url = f"{_base_url}/rest/v1/ora_outputs?id=eq.{row_id}"
    logger.info("Saved ora_output row_id=%s patient_id=%s", row_id, patient_id)
    return row_id, public_url


# --------------------------------------------------------------------- #
#  Helpers                                                                #
# --------------------------------------------------------------------- #

def get_analysis_payload(payload_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a single analysis_payloads row."""
    return _get("analysis_payloads", f"id=eq.{payload_id}&select=*", single=True)


def get_patient_diagnosis_history(patient_id: str) -> list:
    """
    Fetch all past diagnoses for a patient from the diagnosis_history view.

    Returns a list of dicts with payload, KRA, and ORA data, newest first.
    """
    try:
        _init()
        return _get(
            "diagnosis_history",
            f"patient_id=eq.{patient_id}&order=created_at.desc"
        )
    except Exception as exc:
        logger.warning(
            "get_patient_diagnosis_history(%s) failed: %s", patient_id, exc
        )
        return []


def _extract_top_diagnoses(records: List[Dict[str, Any]]) -> List[str]:
    conditions: List[str] = []
    for record in records:
        kra_output = record.get("kra_output") or {}
        diagnoses = kra_output.get("diagnoses") if isinstance(kra_output, dict) else None
        if not isinstance(diagnoses, list):
            continue
        for diagnosis in diagnoses[:2]:
            if not isinstance(diagnosis, dict):
                continue
            condition = str(diagnosis.get("condition") or "").strip()
            if condition:
                conditions.append(condition)
    return conditions


def _extract_lab_abnormalities(records: List[Dict[str, Any]]) -> List[str]:
    abnormalities: List[str] = []
    for record in records:
        labs_json = record.get("labs_json") or {}
        findings = labs_json.get("findings") if isinstance(labs_json, dict) else None
        if isinstance(findings, list):
            for finding in findings:
                text = str(finding or "").strip()
                if text:
                    abnormalities.append(text)
    return abnormalities


def build_patient_history_summary(patient_id: str) -> Dict[str, Any]:
    """
    Build a clinically-compressed longitudinal summary for KRA reasoning.

    The summary is generated from Supabase diagnosis history only, making
    Supabase the canonical reasoning source for prior AI diagnoses and lab
    findings.
    """
    records = get_patient_diagnosis_history(patient_id)
    if not records:
        return {
            "patient_id": patient_id,
            "visit_count": 0,
            "latest_visit_at": None,
            "top_conditions": [],
            "key_lab_findings": [],
            "summary_text": "No prior AI diagnosis or lab history available.",
        }

    top_conditions = _extract_top_diagnoses(records)
    condition_counts = Counter(top_conditions)
    key_conditions = [condition for condition, _ in condition_counts.most_common(5)]

    lab_abnormalities = _extract_lab_abnormalities(records)
    lab_counts = Counter(lab_abnormalities)
    key_labs = [finding for finding, _ in lab_counts.most_common(6)]

    latest_visit = records[0].get("created_at")

    summary_lines = [
        f"Prior visits recorded: {len(records)}.",
        f"Latest visit: {latest_visit or 'unknown'}.",
    ]
    if key_conditions:
        summary_lines.append(
            "Most recurrent prior AI diagnoses: " + ", ".join(key_conditions) + "."
        )
    else:
        summary_lines.append("No structured prior AI diagnoses were captured.")

    if key_labs:
        summary_lines.append(
            "Important prior lab abnormalities: " + "; ".join(key_labs) + "."
        )
    else:
        summary_lines.append("No major prior lab abnormalities were captured.")

    latest_refined_output = str(records[0].get("refined_output") or "").strip()
    if latest_refined_output:
        summary_lines.append(
            "Latest clinician-facing AI summary: "
            + latest_refined_output[:700]
            + ("…" if len(latest_refined_output) > 700 else "")
        )

    return {
        "patient_id": patient_id,
        "visit_count": len(records),
        "latest_visit_at": latest_visit,
        "top_conditions": key_conditions,
        "key_lab_findings": key_labs,
        "summary_text": "\n".join(summary_lines),
    }


def get_patient_history_bundle(patient_id: str) -> Dict[str, Any]:
    """Return full history records plus the clinically-compressed summary."""
    records = get_patient_diagnosis_history(patient_id)
    summary = build_patient_history_summary(patient_id)
    return {
        "patient_id": patient_id,
        "summary": summary,
        "records": records,
    }


def ping_supabase() -> bool:
    """
    Quick connectivity check.

    Returns True if Supabase is reachable and tables exist.
    """
    try:
        _get("analysis_payloads", "select=id&limit=1")
        return True
    except Exception as exc:
        logger.error("Supabase ping failed: %s", exc)
        return False


def verify_schema() -> Dict[str, Any]:
    """
    Validate that all required columns exist on the 3 pipeline tables.

    Attempts a zero-row SELECT for each expected column.  Returns a dict:
        {
            "ok": True/False,
            "tables": {
                "analysis_payloads": {"ok": True, "missing": []},
                "kra_outputs":       {"ok": True, "missing": []},
                "ora_outputs":       {"ok": True, "missing": []},
            },
            "migration_hint": "..."  (only when ok=False)
        }
    """
    _init()

    expected: Dict[str, list[str]] = {
        "analysis_payloads": [
            "id", "session_id", "patient_id", "symptoms_json", "history_json",
            "ecg_json", "labs_json", "context_text", "quality_json", "status",
            "created_at",
        ],
        "kra_outputs": [
            "id", "payload_id", "session_id", "patient_id", "symptoms_text",
            "kra_output", "raw_text", "created_at",
        ],
        "ora_outputs": [
            "id", "kra_output_id", "session_id", "patient_id",
            "experience_level", "refined_output", "disclaimer", "status",
            "created_at",
        ],
    }

    result: Dict[str, Any] = {"ok": True, "tables": {}}

    for table, cols in expected.items():
        missing: list[str] = []
        select = ",".join(cols)
        try:
            _get(table, f"select={select}&limit=0")
        except requests.exceptions.HTTPError as exc:
            # PostgREST returns 400 when a column is unknown.
            # Try each column individually to find which are missing.
            for col in cols:
                try:
                    _get(table, f"select={col}&limit=0")
                except Exception:
                    missing.append(col)
        except Exception as exc:
            logger.warning("verify_schema: table '%s' check failed: %s", table, exc)
            missing = ["<table unreachable>"]

        table_ok = len(missing) == 0
        result["tables"][table] = {"ok": table_ok, "missing": missing}
        if not table_ok:
            result["ok"] = False

    if not result["ok"]:
        result["migration_hint"] = (
            "Run backend/database/migration_add_columns.sql in the Supabase "
            "SQL Editor to add the missing columns."
        )
        logger.warning("Supabase schema validation FAILED: %s", result)
    else:
        logger.info("Supabase schema validation passed – all columns present.")

    return result


# --------------------------------------------------------------------- #
#  Patient cleanup                                                        #
# --------------------------------------------------------------------- #

def delete_patient_data(patient_id: str) -> Dict[str, Any]:
    """
    Delete ALL Supabase analysis data for a patient across all 3 pipeline tables.

    Uses the `session_id` column which stores the workflow session_id.
    The workflow store tracks sessions by patient_id, so we first get all
    session_ids for this patient from the local store, then delete matching
    Supabase rows.

    Args:
        patient_id: The patient identifier (MongoDB _id).

    Returns:
        Dict with counts of deleted rows per table.
    """
    _init()

    deleted: Dict[str, int] = {"analysis_payloads": 0, "kra_outputs": 0, "ora_outputs": 0}

    try:
        # Find all workflow sessions for this patient in the local SQLite store
        from .workflow_store import WorkflowStore
        store = WorkflowStore()
        session_ids = store.get_sessions_for_patient(patient_id)

        if not session_ids:
            logger.info("No workflow sessions found for patient %s", patient_id)
            return deleted

        for sid in session_ids:
            # Delete ora_outputs first (FK dependency)
            try:
                url = f"{_base_url}/rest/v1/ora_outputs?session_id=eq.{sid}"
                resp = requests.delete(url, headers=_headers, timeout=30)
                if resp.status_code < 400:
                    count = len(resp.json()) if resp.text.strip() else 0
                    deleted["ora_outputs"] += count
            except Exception as exc:
                logger.warning("Failed to delete ora_outputs for session %s: %s", sid, exc)

            # Delete kra_outputs
            try:
                url = f"{_base_url}/rest/v1/kra_outputs?session_id=eq.{sid}"
                resp = requests.delete(url, headers=_headers, timeout=30)
                if resp.status_code < 400:
                    count = len(resp.json()) if resp.text.strip() else 0
                    deleted["kra_outputs"] += count
            except Exception as exc:
                logger.warning("Failed to delete kra_outputs for session %s: %s", sid, exc)

            # Delete analysis_payloads
            try:
                url = f"{_base_url}/rest/v1/analysis_payloads?session_id=eq.{sid}"
                resp = requests.delete(url, headers=_headers, timeout=30)
                if resp.status_code < 400:
                    count = len(resp.json()) if resp.text.strip() else 0
                    deleted["analysis_payloads"] += count
            except Exception as exc:
                logger.warning("Failed to delete analysis_payloads for session %s: %s", sid, exc)

            # Delete local SQLite session
            try:
                store.delete_session(sid)
            except Exception as exc:
                logger.warning("Failed to delete local session %s: %s", sid, exc)

        logger.info("Patient %s cleanup: %s", patient_id, deleted)
        return deleted

    except Exception as exc:
        logger.error("Patient data cleanup failed for %s: %s", patient_id, exc)
        return deleted
