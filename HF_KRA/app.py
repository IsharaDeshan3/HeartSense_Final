from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from kra_engine import analyze_request, get_engine, get_runtime_info
from schemas import KRARequest, KRAResponse


app = FastAPI(
    title="KRA Analysis API",
    version="1.0.0",
    description="Standalone KRA inference API for Hugging Face Spaces.",
)

# Keep the Space usable from external services during development and testing.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def warmup() -> None:
    """Preload the model during startup so the first API call is faster."""

    warmup_on_startup = os.getenv("WARMUP_ON_STARTUP", "1").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    if warmup_on_startup:
        get_engine()


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "KRA Analysis API",
        "status": "ready",
        "model_id": os.getenv("MODEL_ID", "Qwen/Qwen2.5-1.5B-Instruct"),
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/runtime")
def runtime() -> dict[str, object]:
    """Expose runtime device details to verify CPU fallback behavior."""

    return get_runtime_info()


@app.post("/v1/kra/analyze", response_model=KRAResponse)
def kra_analyze(payload: KRARequest) -> KRAResponse:
    """Run one KRA analysis request and return structured JSON."""

    try:
        return analyze_request(payload)
    except Exception as exc:  # noqa: BLE001 - return a clean API error
        raise HTTPException(status_code=500, detail=str(exc)) from exc
