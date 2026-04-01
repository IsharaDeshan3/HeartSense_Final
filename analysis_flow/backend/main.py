"""FastAPI backend entry point for the workflow-based analysis service."""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from dotenv import find_dotenv, load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

if os.name == "nt":
    # Avoid Windows Proactor socket-accept issues under uvicorn.
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent))

load_dotenv(find_dotenv(), override=True)

from routes import workflow

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: validate dependencies and warm heavy components."""
    logger.info("Starting KRA-ORA Medical Analysis System...")

    try:
        from processing.supabase_payload import verify_schema

        schema_result = verify_schema()
        if not schema_result["ok"]:
            logger.warning(
                "SUPABASE SCHEMA INCOMPLETE - run migration_add_columns.sql. Details: %s",
                schema_result["tables"],
            )
        else:
            logger.info("Supabase schema OK - all pipeline columns present")
    except Exception as exc:
        logger.warning("Supabase schema check skipped (connection issue): %s", exc)

    try:
        from core.llm_engine import LLMEngine

        logger.info("Preloading LLM models for analysis_flow ...")
        engine = LLMEngine.instance()
        health = engine.health()
        logger.info(
            "LLM models loaded (KRA runtime=%s, fallback=%s, KRA model=%s, ORA model=%s)",
            health.get("kra_runtime"),
            health.get("kra_fallback_active"),
            health.get("kra_model"),
            health.get("ora_model"),
        )
    except Exception:
        from core.llm_engine import LLMEngine

        logger.error("LLM preload failed - models unavailable until environment is fixed")
        logger.error("LLM diagnostics: %s", LLMEngine.diagnostics())
        logger.exception("LLM preload exception")

    try:
        from backend.processing.search_service import SearchService

        search_svc = SearchService()
        readiness = search_svc.readiness_status()
        logger.info(
            "FAISS indexes preloaded (textbook=%s, rare_cases=%s)",
            readiness.get("faiss_ready"),
            readiness.get("rare_cases_ready"),
        )
    except Exception:
        logger.warning("FAISS index preload failed - first search will be slower")
        logger.exception("FAISS preload exception")

    logger.info("System ready")
    yield
    logger.info("Shutting down...")


app = FastAPI(
    title="KRA-ORA Medical Analysis API",
    description="Workflow-based AI medical analysis with local LLM inference and Supabase persistence",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        os.getenv("FRONTEND_URL", "http://localhost:3000"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(workflow.router, prefix="/api/workflow/v1", tags=["Workflow v1"])


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "2.0.0",
    }


@app.get("/health/schema")
async def schema_check():
    from processing.supabase_payload import verify_schema

    return verify_schema()


@app.get("/")
async def root():
    return {
        "name": "KRA-ORA Medical Analysis API",
        "version": "2.0.0",
        "docs": "/docs",
        "health": "/health",
        "workflow": "/api/workflow/v1",
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8080))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info",
    )