from __future__ import annotations

import os
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from core.feedback_store import LocalFeedbackStore


router = APIRouter()


class LocalFeedbackSubmission(BaseModel):
    session_id: str
    original_diagnosis: str
    proposed_correction: str
    rationale: str = Field(default="")
    case_context: Dict[str, Any] = Field(default_factory=dict)


_store: Optional[LocalFeedbackStore] = None


def get_store() -> LocalFeedbackStore:
    global _store
    if _store is None:
        _store = LocalFeedbackStore(root_dir=os.getenv("FEEDBACK_STORE_DIR", "feedback_store"))
    return _store


@router.post("/submit")
async def submit_feedback(payload: LocalFeedbackSubmission):
    if not payload.session_id:
        raise HTTPException(status_code=400, detail="Missing session_id")

    feedback_id = get_store().submit(
        session_id=payload.session_id,
        original=payload.original_diagnosis,
        correction=payload.proposed_correction,
        rationale=payload.rationale,
        case_context=payload.case_context,
    )
    return {"feedback_id": feedback_id, "status": "pending"}
