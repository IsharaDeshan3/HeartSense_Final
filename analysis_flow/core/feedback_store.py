from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any, Dict, List, Optional


class LocalFeedbackStore:
    """Minimal JSONL feedback store for single-user prototype."""

    def __init__(self, root_dir: str = "feedback_store"):
        self.root_dir = root_dir
        os.makedirs(self.root_dir, exist_ok=True)
        self.pending_path = os.path.join(self.root_dir, "pending.jsonl")
        self.approved_path = os.path.join(self.root_dir, "approved.jsonl")

    def submit(
        self,
        *,
        session_id: str,
        original: str,
        correction: str,
        rationale: str,
        case_context: Dict[str, Any],
    ) -> str:
        feedback_id = str(uuid.uuid4())
        record = {
            "feedback_id": feedback_id,
            "created_at": time.time(),
            "session_id": session_id,
            "original_diagnosis": original,
            "proposed_correction": correction,
            "rationale": rationale,
            "case_context": case_context,
            "status": "pending",
        }
        with open(self.pending_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
        return feedback_id

    def list_pending(self, limit: int = 50) -> List[Dict[str, Any]]:
        if not os.path.exists(self.pending_path):
            return []
        out: List[Dict[str, Any]] = []
        with open(self.pending_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    out.append(json.loads(line))
                except Exception:
                    continue
        return out[-limit:]

    def approve(self, feedback_id: str, admin_notes: str = "") -> bool:
        if not os.path.exists(self.pending_path):
            return False
        kept: List[Dict[str, Any]] = []
        approved: Optional[Dict[str, Any]] = None
        with open(self.pending_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                if rec.get("feedback_id") == feedback_id:
                    approved = rec
                else:
                    kept.append(rec)

        if not approved:
            return False

        approved["status"] = "approved"
        approved["admin_notes"] = admin_notes
        approved["approved_at"] = time.time()

        with open(self.pending_path, "w", encoding="utf-8") as f:
            for rec in kept:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")

        with open(self.approved_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(approved, ensure_ascii=False) + "\n")
        return True
