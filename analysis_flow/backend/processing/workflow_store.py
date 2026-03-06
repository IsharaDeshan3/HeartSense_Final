from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .workflow_state import WorkflowState, can_transition, state_index


_local = threading.local()
_DEFAULT_DB_PATH = os.getenv("WORKFLOW_DB_PATH", str(Path(__file__).parent.parent / "database" / "session_temp.db"))


def _get_connection(db_path: str = _DEFAULT_DB_PATH) -> sqlite3.Connection:
    if not hasattr(_local, "conn") or _local.conn is None:
        db_file = Path(db_path)
        db_file.parent.mkdir(parents=True, exist_ok=True)
        _local.conn = sqlite3.connect(db_file, check_same_thread=False)
        _local.conn.row_factory = sqlite3.Row
    return _local.conn


_CREATE_SQL = """
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  doctor_id TEXT,
  current_state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
    lock_version INTEGER NOT NULL DEFAULT 0,
    supabase_payload_id TEXT,
    supabase_kra_id TEXT,
    supabase_ora_id TEXT
);

CREATE TABLE IF NOT EXISTS step_payloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(session_id, step_name, revision),
  FOREIGN KEY(session_id) REFERENCES sessions(session_id)
);

CREATE TABLE IF NOT EXISTS orchestration_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  state_from TEXT,
  state_to TEXT,
  status TEXT NOT NULL,
  message TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(session_id)
);

CREATE TABLE IF NOT EXISTS retrieval_context (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    chunk_id TEXT,
    score REAL,
    content TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(session_id)
);

CREATE INDEX IF NOT EXISTS idx_step_payloads_session_step ON step_payloads(session_id, step_name);
CREATE INDEX IF NOT EXISTS idx_events_session ON orchestration_events(session_id);
CREATE INDEX IF NOT EXISTS idx_retrieval_session_source ON retrieval_context(session_id, source_type);
"""


class WorkflowStore:
    def __init__(self, db_path: str = _DEFAULT_DB_PATH) -> None:
        self.db_path = db_path
        self._ensure_schema()

    def _ensure_schema(self) -> None:
        conn = _get_connection(self.db_path)
        conn.executescript(_CREATE_SQL)

        cols = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(sessions)").fetchall()
        }
        if "supabase_payload_id" not in cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN supabase_payload_id TEXT")
        if "supabase_kra_id" not in cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN supabase_kra_id TEXT")
        if "supabase_ora_id" not in cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN supabase_ora_id TEXT")

        conn.commit()

    def create_session(self, patient_id: str, doctor_id: Optional[str], correlation_id: str) -> dict[str, Any]:
        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        conn = _get_connection(self.db_path)
        conn.execute(
            """
            INSERT INTO sessions (session_id, patient_id, doctor_id, current_state, created_at, updated_at, correlation_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                patient_id,
                doctor_id,
                WorkflowState.SESSION_CREATED.value,
                now,
                now,
                correlation_id,
            ),
        )
        conn.execute(
            """
            INSERT INTO orchestration_events (session_id, event_type, state_from, state_to, status, message, duration_ms, created_at, correlation_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                "SESSION_INIT",
                None,
                WorkflowState.SESSION_CREATED.value,
                "SUCCESS",
                "Session initialized",
                0,
                now,
                correlation_id,
            ),
        )
        conn.commit()
        return {
            "session_id": session_id,
            "patient_id": patient_id,
            "doctor_id": doctor_id,
            "current_state": WorkflowState.SESSION_CREATED.value,
            "created_at": now,
            "updated_at": now,
            "correlation_id": correlation_id,
        }

    def get_session(self, session_id: str) -> Optional[dict[str, Any]]:
        conn = _get_connection(self.db_path)
        row = conn.execute("SELECT * FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
        if row is None:
            return None

        payload_rows = conn.execute(
            "SELECT step_name, payload_json, revision, created_at FROM step_payloads WHERE session_id = ? ORDER BY revision DESC",
            (session_id,),
        ).fetchall()

        step_payloads: dict[str, dict[str, Any]] = {}
        for payload_row in payload_rows:
            step_name = payload_row["step_name"]
            if step_name in step_payloads:
                continue
            step_payloads[step_name] = {
                "payload": json.loads(payload_row["payload_json"]),
                "revision": payload_row["revision"],
                "created_at": payload_row["created_at"],
            }

        data = dict(row)
        data["step_payloads"] = step_payloads
        return data

    def save_step(self, session_id: str, step_name: str, payload: dict[str, Any], next_state: WorkflowState) -> dict[str, Any]:
        conn = _get_connection(self.db_path)
        row = conn.execute(
            "SELECT current_state, lock_version, correlation_id FROM sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        if row is None:
            raise ValueError("SESSION_NOT_FOUND")

        current_state = WorkflowState(row["current_state"])

        # ── Idempotency guard ────────────────────────────────────────────────
        # If the session is already AT or PAST the target next_state, this step
        # was already saved in a previous request.  Return the existing payload
        # instead of raising a 409 conflict.
        curr_idx = state_index(current_state)
        next_idx = state_index(next_state)
        if curr_idx >= next_idx >= 0:
            existing = self.get_latest_step_payload(session_id, step_name)
            if existing:
                return {
                    "session_id": session_id,
                    "state": current_state.value,
                    "saved_step": step_name,
                    "revision": existing["revision"],
                    "updated_at": existing["created_at"],
                }
            # No payload yet but state is already advanced — still OK, just
            # insert the new payload without changing the state.
            now = datetime.now(timezone.utc).isoformat()
            revision_row = conn.execute(
                "SELECT COALESCE(MAX(revision), 0) AS max_revision FROM step_payloads WHERE session_id = ? AND step_name = ?",
                (session_id, step_name),
            ).fetchone()
            next_revision = int(revision_row["max_revision"]) + 1
            conn.execute(
                "INSERT INTO step_payloads (session_id, step_name, payload_json, payload_hash, revision, created_at) VALUES (?, ?, ?, NULL, ?, ?)",
                (session_id, step_name, json.dumps(payload), next_revision, now),
            )
            conn.commit()
            return {
                "session_id": session_id,
                "state": current_state.value,
                "saved_step": step_name,
                "revision": next_revision,
                "updated_at": now,
            }

        if not can_transition(current_state, next_state):
            raise RuntimeError(f"INVALID_TRANSITION:{current_state.value}->{next_state.value}")

        now = datetime.now(timezone.utc).isoformat()
        revision_row = conn.execute(
            "SELECT COALESCE(MAX(revision), 0) AS max_revision FROM step_payloads WHERE session_id = ? AND step_name = ?",
            (session_id, step_name),
        ).fetchone()
        next_revision = int(revision_row["max_revision"]) + 1

        conn.execute(
            """
            INSERT INTO step_payloads (session_id, step_name, payload_json, payload_hash, revision, created_at)
            VALUES (?, ?, ?, NULL, ?, ?)
            """,
            (session_id, step_name, json.dumps(payload), next_revision, now),
        )

        conn.execute(
            """
            UPDATE sessions
            SET current_state = ?, updated_at = ?, lock_version = ?
            WHERE session_id = ?
            """,
            (next_state.value, now, int(row["lock_version"]) + 1, session_id),
        )

        conn.execute(
            """
            INSERT INTO orchestration_events (session_id, event_type, state_from, state_to, status, message, duration_ms, created_at, correlation_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                f"SAVE_{step_name.upper()}",
                current_state.value,
                next_state.value,
                "SUCCESS",
                f"{step_name} persisted",
                0,
                now,
                row["correlation_id"],
            ),
        )

        conn.commit()

        return {
            "session_id": session_id,
            "state": next_state.value,
            "saved_step": step_name,
            "revision": next_revision,
            "updated_at": now,
        }

    def transition_state(
        self,
        session_id: str,
        next_state: WorkflowState,
        event_type: str,
        message: str,
    ) -> dict[str, Any]:
        conn = _get_connection(self.db_path)
        row = conn.execute(
            "SELECT current_state, lock_version, correlation_id FROM sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        if row is None:
            raise ValueError("SESSION_NOT_FOUND")

        current_state = WorkflowState(row["current_state"])
        if not can_transition(current_state, next_state):
            raise RuntimeError(f"INVALID_TRANSITION:{current_state.value}->{next_state.value}")

        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """
            UPDATE sessions
            SET current_state = ?, updated_at = ?, lock_version = ?
            WHERE session_id = ?
            """,
            (next_state.value, now, int(row["lock_version"]) + 1, session_id),
        )
        conn.execute(
            """
            INSERT INTO orchestration_events (session_id, event_type, state_from, state_to, status, message, duration_ms, created_at, correlation_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                event_type,
                current_state.value,
                next_state.value,
                "SUCCESS",
                message,
                0,
                now,
                row["correlation_id"],
            ),
        )
        conn.commit()

        return {
            "session_id": session_id,
            "state": next_state.value,
            "updated_at": now,
        }

    def get_latest_step_payload(self, session_id: str, step_name: str) -> Optional[dict[str, Any]]:
        conn = _get_connection(self.db_path)
        row = conn.execute(
            """
            SELECT payload_json, revision, created_at
            FROM step_payloads
            WHERE session_id = ? AND step_name = ?
            ORDER BY revision DESC
            LIMIT 1
            """,
            (session_id, step_name),
        ).fetchone()
        if row is None:
            return None
        return {
            "payload": json.loads(row["payload_json"]),
            "revision": row["revision"],
            "created_at": row["created_at"],
        }

    def save_retrieval_context(
        self,
        session_id: str,
        source_type: str,
        content: str,
        metadata: Optional[dict[str, Any]] = None,
        score: Optional[float] = None,
        chunk_id: Optional[str] = None,
    ) -> None:
        conn = _get_connection(self.db_path)
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """
            INSERT INTO retrieval_context (session_id, source_type, chunk_id, score, content, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                source_type,
                chunk_id,
                score,
                content,
                json.dumps(metadata or {}),
                now,
            ),
        )
        conn.commit()

    def list_retrieval_context(self, session_id: str) -> list[dict[str, Any]]:
        conn = _get_connection(self.db_path)
        rows = conn.execute(
            """
            SELECT source_type, chunk_id, score, content, metadata_json, created_at
            FROM retrieval_context
            WHERE session_id = ?
            ORDER BY id ASC
            """,
            (session_id,),
        ).fetchall()

        return [
            {
                "source_type": row["source_type"],
                "chunk_id": row["chunk_id"],
                "score": row["score"],
                "content": row["content"],
                "metadata": json.loads(row["metadata_json"] or "{}"),
                "created_at": row["created_at"],
            }
            for row in rows
        ]

    def set_supabase_payload_id(self, session_id: str, payload_id: str) -> None:
        conn = _get_connection(self.db_path)
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """
            UPDATE sessions
            SET supabase_payload_id = ?, updated_at = ?
            WHERE session_id = ?
            """,
            (payload_id, now, session_id),
        )
        conn.commit()

    def set_supabase_kra_id(self, session_id: str, kra_id: str) -> None:
        conn = _get_connection(self.db_path)
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """
            UPDATE sessions
            SET supabase_kra_id = ?, updated_at = ?
            WHERE session_id = ?
            """,
            (kra_id, now, session_id),
        )
        conn.commit()

    def set_supabase_ora_id(self, session_id: str, ora_id: str) -> None:
        conn = _get_connection(self.db_path)
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """
            UPDATE sessions
            SET supabase_ora_id = ?, updated_at = ?
            WHERE session_id = ?
            """,
            (ora_id, now, session_id),
        )
        conn.commit()

    def get_sessions_for_patient(self, patient_id: str) -> list[str]:
        """Return all session_ids for a given patient_id."""
        conn = _get_connection(self.db_path)
        rows = conn.execute(
            "SELECT session_id FROM sessions WHERE patient_id = ?",
            (patient_id,),
        ).fetchall()
        return [row["session_id"] for row in rows]

    def delete_session(self, session_id: str) -> None:
        """Delete a session and all its related data from local SQLite."""
        conn = _get_connection(self.db_path)
        conn.execute("DELETE FROM retrieval_context WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM orchestration_events WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM step_payloads WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
        conn.commit()
