"""
backend/routes/test_ui.py

Serves the pipeline test UI and sample data.

Endpoints:
  GET  /test                — serves the test HTML page
  GET  /test/samples        — lists available dummy JSON samples
  GET  /test/samples/{name} — returns a specific sample's JSON
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse

logger = logging.getLogger(__name__)
router = APIRouter()

# Path to test_data directory (relative to backend/)
_SAMPLES_DIR = Path(__file__).parent.parent / "test_data"


# ================================================================== #
#  GET /test/samples — list available samples                         #
# ================================================================== #

@router.get("/samples", summary="List available test samples")
async def list_samples():
    """Return metadata for all sample JSON files."""
    samples = []
    if not _SAMPLES_DIR.exists():
        return JSONResponse({"samples": [], "error": "test_data directory not found"})

    for fp in sorted(_SAMPLES_DIR.glob("sample_*.json")):
        try:
            data = json.loads(fp.read_text(encoding="utf-8"))
            samples.append({
                "id": fp.stem,
                "filename": fp.name,
                "name": data.get("name", fp.stem),
                "description": data.get("description", ""),
                "severity": data.get("severity", "unknown"),
            })
        except Exception as exc:
            logger.warning("Failed to read sample %s: %s", fp, exc)
    return {"samples": samples}


# ================================================================== #
#  GET /test/samples/{sample_id} — get one sample's full JSON         #
# ================================================================== #

@router.get("/samples/{sample_id}", summary="Get a test sample by ID")
async def get_sample(sample_id: str):
    """Return the full JSON for a specific sample."""
    fp = _SAMPLES_DIR / f"{sample_id}.json"
    if not fp.exists():
        raise HTTPException(status_code=404, detail=f"Sample '{sample_id}' not found")
    try:
        data = json.loads(fp.read_text(encoding="utf-8"))
        return data
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ================================================================== #
#  GET /test — serve the HTML test UI                                  #
# ================================================================== #

@router.get("", response_class=HTMLResponse, summary="Pipeline test UI")
async def test_ui_page():
    """Serve the pipeline tester single-page app."""
    html_path = Path(__file__).parent.parent / "static" / "test_ui.html"
    if not html_path.exists():
        raise HTTPException(status_code=500, detail="test_ui.html not found")
    return HTMLResponse(html_path.read_text(encoding="utf-8"))
