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
from typing import Any, Dict, Optional, Tuple

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

def save_analysis_payload(
    session_id: str,
    symptoms: Dict[str, Any],
    ecg: Optional[Dict[str, Any]],
    labs: Optional[Dict[str, Any]],
    context_text: str,
    quality: Optional[Dict[str, Any]] = None,
) -> Tuple[str, str]:
    """
    Insert raw patient inputs + FAISS context into `analysis_payloads`.

    Args:
        session_id: Local SQLite session UUID.
        symptoms: Patient symptoms dict.
        ecg: ECG findings dict or None.
        labs: Lab results dict or None.
        context_text: FAISS-retrieved context string.
        quality: FAISS retrieval quality metrics dict.

    Returns:
        (row_id, public_url) where
          row_id     = UUID of the inserted Supabase row
          public_url = Supabase REST URL that HF Spaces use to fetch the row
    """
    row = {
        "session_id": session_id,
        "symptoms_json": symptoms,
        "history_json": {},
        "ecg_json": ecg if ecg is not None else {},
        "labs_json": labs if labs is not None else {},
        "context_text": context_text,
        "quality_json": quality or {},
        "status": "pending",
    }

    inserted = _post("analysis_payloads", row)
    row_id: str = inserted["id"]
    _init()
    public_url = f"{_base_url}/rest/v1/analysis_payloads?id=eq.{row_id}"

    logger.info("Saved analysis_payload row_id=%s", row_id)
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
) -> Tuple[str, str]:
    """
    Insert KRA agent output into `kra_outputs`.

    Args:
        session_id: Local session UUID.
        payload_id: FK to analysis_payloads row.
        symptoms_text: Plain-text symptom string (ORA needs this).
        kra_result: Raw output from KRA -- dict or string.

    Returns:
        (row_id, public_url) pointing to the new kra_outputs row.
    """
    if isinstance(kra_result, str):
        kra_output_dict: Dict[str, Any] = {}
        raw_text: Optional[str] = kra_result
    else:
        kra_output_dict = kra_result
        raw_text = None

    row = {
        "session_id": session_id,
        "payload_id": payload_id,
        "symptoms_text": symptoms_text,
        "kra_output": kra_output_dict,
        "raw_text": raw_text,
    }

    inserted = _post("kra_outputs", row)
    row_id: str = inserted["id"]
    _init()
    public_url = f"{_base_url}/rest/v1/kra_outputs?id=eq.{row_id}"

    logger.info("Saved kra_output row_id=%s", row_id)
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

    inserted = _post("ora_outputs", row)
    row_id: str = inserted["id"]
    _init()
    public_url = f"{_base_url}/rest/v1/ora_outputs?id=eq.{row_id}"
    logger.info("Saved ora_output row_id=%s", row_id)
    return row_id, public_url


# --------------------------------------------------------------------- #
#  Helpers                                                                #
# --------------------------------------------------------------------- #

def get_analysis_payload(payload_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a single analysis_payloads row."""
    return _get("analysis_payloads", f"id=eq.{payload_id}&select=*", single=True)


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
