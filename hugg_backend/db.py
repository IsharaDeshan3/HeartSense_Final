"""
hugg_backend/db.py

Read-only access to the shared workflow SQLite database used by analysis_flow.
Fetches session data including extraction, ECG, and lab payloads so the
Hugging Face pipeline can build prompts from the same patient data.
"""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv

load_dotenv()

_DEFAULT_DB = os.getenv(
    "WORKFLOW_DB_PATH",
    str(Path(__file__).parent.parent / "analysis_flow" / "backend" / "database" / "session_temp.db"),
)


def _connect(db_path: str = _DEFAULT_DB) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def get_session(session_id: str) -> Optional[dict[str, Any]]:
    """Return the full session row plus its step payloads."""
    conn = _connect()
    row = conn.execute(
        "SELECT * FROM sessions WHERE session_id = ?", (session_id,)
    ).fetchone()
    if row is None:
        return None

    data = dict(row)

    payloads = conn.execute(
        "SELECT step_name, payload_json, revision FROM step_payloads "
        "WHERE session_id = ? ORDER BY revision DESC",
        (session_id,),
    ).fetchall()

    step_payloads: dict[str, Any] = {}
    for p in payloads:
        name = p["step_name"]
        if name not in step_payloads:
            step_payloads[name] = json.loads(p["payload_json"])

    data["step_payloads"] = step_payloads
    conn.close()
    return data


def get_retrieval_context(session_id: str) -> str:
    """Return the FAISS retrieval context already generated for this session."""
    conn = _connect()
    rows = conn.execute(
        "SELECT content FROM retrieval_context WHERE session_id = ? ORDER BY id",
        (session_id,),
    ).fetchall()
    conn.close()
    return "\n\n".join(r["content"] for r in rows if r["content"])
