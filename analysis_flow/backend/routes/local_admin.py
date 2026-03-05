from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from core.feedback_store import LocalFeedbackStore


router = APIRouter()


_store: Optional[LocalFeedbackStore] = None


def get_store() -> LocalFeedbackStore:
    global _store
    if _store is None:
        _store = LocalFeedbackStore(root_dir=os.getenv("FEEDBACK_STORE_DIR", "feedback_store"))
    return _store


def _require_admin(x_admin_token: Optional[str]) -> None:
    expected = os.getenv("ADMIN_TOKEN", "")
    if not expected:
        return
    if not x_admin_token or x_admin_token != expected:
        raise HTTPException(status_code=403, detail="Admin token required")


class ApproveRequest(BaseModel):
    feedback_id: str
    admin_notes: str = Field(default="")


@router.get("/feedback/pending")
async def list_pending(limit: int = 50, x_admin_token: Optional[str] = Header(default=None)):
    _require_admin(x_admin_token)
    return {"pending": get_store().list_pending(limit=limit)}


@router.post("/feedback/approve")
async def approve(req: ApproveRequest, x_admin_token: Optional[str] = Header(default=None)):
    _require_admin(x_admin_token)
    ok = get_store().approve(req.feedback_id, admin_notes=req.admin_notes)
    if not ok:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return {"status": "approved", "feedback_id": req.feedback_id}
