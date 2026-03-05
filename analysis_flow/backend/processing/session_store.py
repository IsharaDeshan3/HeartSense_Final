"""
backend/processing/session_store.py

Local SQLite-backed session tracker.
- No external dependencies beyond the Python stdlib.
- Stores: session_id, raw inputs (symptoms/ecg/labs), status, step log, timestamps.
- Used as the authoritative local audit trail; Supabase stores the heavy payloads.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Thread-local connection pool so each thread gets its own connection
_local = threading.local()

# --------------------------------------------------------------------- #
#  DB path                                                                #
# --------------------------------------------------------------------- #
_DEFAULT_DB_PATH = os.getenv("SESSION_DB_PATH", "sessions.db")


def _get_connection(db_path: str = _DEFAULT_DB_PATH) -> sqlite3.Connection:
    """Return (or create) a per-thread SQLite connection."""
    if not hasattr(_local, "conn") or _local.conn is None:
        _local.conn = sqlite3.connect(db_path, check_same_thread=False)
        _local.conn.row_factory = sqlite3.Row
    return _local.conn


# --------------------------------------------------------------------- #
#  Schema bootstrap                                                       #
# --------------------------------------------------------------------- #
_CREATE_SQL = """
CREATE TABLE IF NOT EXISTS sessions (
    session_id      TEXT PRIMARY KEY,
    symptoms_json   TEXT NOT NULL,
    ecg_json        TEXT,
    labs_json       TEXT,
    experience_level TEXT NOT NULL DEFAULT 'seasoned',
    status          TEXT NOT NULL DEFAULT 'CREATED',
    step            TEXT,
    error_message   TEXT,
    supabase_payload_id TEXT,
    supabase_kra_id     TEXT,
    supabase_ora_id     TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
"""


def _ensure_schema(db_path: str = _DEFAULT_DB_PATH) -> None:
    conn = _get_connection(db_path)
    conn.execute(_CREATE_SQL)
    conn.commit()


# --------------------------------------------------------------------- #
#  Public helpers                                                         #
# --------------------------------------------------------------------- #

class SessionStore:
    """
    Thread-safe SQLite session store.

    Typical usage
    -------------
    store = SessionStore()
    sid = store.create(symptoms={...}, ecg={...}, labs={...})
    store.update_status(sid, "FAISS_SEARCH", "IN_PROGRESS")
    store.set_supabase_ids(sid, payload_id="abc", kra_id=None, ora_id=None)
    session = store.get(sid)
    """

    def __init__(self, db_path: str = _DEFAULT_DB_PATH) -> None:
        self.db_path = db_path
        _ensure_schema(db_path)
        logger.info("SessionStore ready at %s", db_path)

    # ------------------------------------------------------------------ #

    def create(
        self,
        symptoms: Dict[str, Any],
        ecg: Optional[Dict[str, Any]] = None,
        labs: Optional[Dict[str, Any]] = None,
        experience_level: str = "seasoned",
    ) -> str:
        """
        Persist a new analysis session and return its session_id (UUID).

        Args:
            symptoms: Patient symptoms dict (must be JSON-serialisable).
            ecg: ECG data dict or None (skipped/not provided).
            labs: Lab results dict or None.
            experience_level: 'newbie' | 'seasoned' | 'expert'.

        Returns:
            session_id string (UUID4).
        """
        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        conn = _get_connection(self.db_path)
        conn.execute(
            """
            INSERT INTO sessions
              (session_id, symptoms_json, ecg_json, labs_json,
               experience_level, status, step, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'CREATED', 'INIT', ?, ?)
            """,
            (
                session_id,
                json.dumps(symptoms),
                json.dumps(ecg) if ecg is not None else None,
                json.dumps(labs) if labs is not None else None,
                experience_level,
                now,
                now,
            ),
        )
        conn.commit()
        logger.debug("Session created: %s", session_id)
        return session_id

    # ------------------------------------------------------------------ #

    def update_status(
        self,
        session_id: str,
        step: str,
        status: str,
        error_message: Optional[str] = None,
    ) -> None:
        """
        Update the pipeline step and status for a session.

        Args:
            session_id: The session to update.
            step: Human-readable step name e.g. 'FAISS_SEARCH', 'KRA_CALL'.
            status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'.
            error_message: Optional error detail when status='FAILED'.
        """
        now = datetime.now(timezone.utc).isoformat()
        conn = _get_connection(self.db_path)
        conn.execute(
            """
            UPDATE sessions
               SET step=?, status=?, error_message=?, updated_at=?
             WHERE session_id=?
            """,
            (step, status, error_message, now, session_id),
        )
        conn.commit()

    # ------------------------------------------------------------------ #

    def set_supabase_ids(
        self,
        session_id: str,
        *,
        payload_id: Optional[str] = None,
        kra_id: Optional[str] = None,
        ora_id: Optional[str] = None,
    ) -> None:
        """
        Store Supabase row IDs for the three pipeline stages.

        Pass only the IDs that are now known; None values are ignored.
        """
        now = datetime.now(timezone.utc).isoformat()
        updates = []
        params: list = []

        if payload_id is not None:
            updates.append("supabase_payload_id=?")
            params.append(payload_id)
        if kra_id is not None:
            updates.append("supabase_kra_id=?")
            params.append(kra_id)
        if ora_id is not None:
            updates.append("supabase_ora_id=?")
            params.append(ora_id)

        if not updates:
            return

        updates.append("updated_at=?")
        params.extend([now, session_id])

        conn = _get_connection(self.db_path)
        conn.execute(
            f"UPDATE sessions SET {', '.join(updates)} WHERE session_id=?",
            params,
        )
        conn.commit()

    # ------------------------------------------------------------------ #

    def get(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve a session row as a dict.

        Returns None if session not found.
        """
        conn = _get_connection(self.db_path)
        row = conn.execute(
            "SELECT * FROM sessions WHERE session_id=?", (session_id,)
        ).fetchone()
        if row is None:
            return None
        return dict(row)

    # ------------------------------------------------------------------ #

    def list_recent(self, limit: int = 20) -> list[Dict[str, Any]]:
        """Return the most recent `limit` sessions ordered by created_at desc."""
        conn = _get_connection(self.db_path)
        rows = conn.execute(
            "SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]
