"""
FastAPI Backend for KRA-ORA Medical Analysis System
Main API entry point with CORS support for React frontend
"""

import asyncio
import os 
import sys 
import logging 
from pathlib import Path 
from contextlib import asynccontextmanager 
from datetime import datetime 
from typing import Optional 

from fastapi import FastAPI ,HTTPException ,Depends ,status 
from fastapi .middleware .cors import CORSMiddleware 
from pydantic import BaseModel ,Field 
from dotenv import load_dotenv ,find_dotenv 

if os.name == "nt":
    # Avoid Windows Proactor socket-accept issues under uvicorn.
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

sys .path .insert (0 ,str (Path (__file__ ).parent ))
sys .path .insert (0 ,str (Path (__file__ ).parent .parent ))

load_dotenv (find_dotenv (), override=True)

LOCAL_MODE =os .getenv ("LOCAL_MODE","" ).strip ().lower ()in {"1","true","yes"}

# Choose the route set and startup dependencies that match the active backend mode.
if LOCAL_MODE :
    from routes import local_analysis 
else :
    from database import get_supabase_client ,SupabaseClient 
    from services .retriever import SupabaseRetriever 
    from services .embedding import EmbeddingService 
    from routes import analysis ,admin ,auth 
from routes import workflow

logging .basicConfig (

level =logging .INFO ,

format ='%(asctime)s | %(levelname)s | %(name)s | %(message)s'
)

logger =logging .getLogger (__name__ )

if not LOCAL_MODE :

    retriever :Optional [SupabaseRetriever ]=None 
    embedding_service :Optional [EmbeddingService ]=None 


@asynccontextmanager 

async def lifespan (app :FastAPI ):
    """Application lifespan - initialize and cleanup"""
    global retriever ,embedding_service 

    logger .info ("Starting KRA-ORA Medical Analysis System...")

    # Cloud mode needs the retriever and embedding service ready before any
    # analysis route can assemble context for KRA.
    if not LOCAL_MODE :
        try :
            embedding_service =EmbeddingService ()
            logger .info ("Embedding service initialized")

        except Exception as e :
            logger .error (f"Failed to initialize embedding service: {e }")
            raise 
        try :
            retriever =SupabaseRetriever (embedding_service =embedding_service )
            logger .info ("Supabase retriever initialized")
        except Exception as e :
            logger .error (f"Failed to initialize retriever: {e }")
            raise 
    else :
        # Local mode bypasses Supabase retriever setup and relies on the
        # offline FAISS + local-model pipeline exposed from routes/local_*.py.
        logger .info ("LOCAL_MODE enabled - using local FAISS + local KRA/ORA workflow")

    # Validate Supabase schema columns on startup.
    try:
        from processing.supabase_payload import verify_schema
        schema_result = verify_schema()
        if not schema_result["ok"]:
            logger.warning(
                "⚠ SUPABASE SCHEMA INCOMPLETE – missing columns detected. "
                "Run migration_add_columns.sql in the Supabase SQL Editor. "
                "Details: %s", schema_result["tables"]
            )
        else:
            logger.info("Supabase schema OK – all pipeline columns present")
    except Exception as exc:
        logger.warning("Supabase schema check skipped (connection issue): %s", exc)

    # ── Eagerly preload LLM models so first request is fast ──
    try:
        from core.llm_engine import LLMEngine
        # The shared engine is loaded here so workflow_service.py can call KRA
        # and ORA without paying the cold-start penalty on the first request.
        logger.info("Preloading LLM models for analysis_flow ...")
        engine = LLMEngine.instance()
        health = engine.health()
        logger.info(
            "LLM models loaded and ready (KRA runtime=%s, fallback=%s, KRA model=%s, ORA model=%s)",
            health.get("kra_runtime"),
            health.get("kra_fallback_active"),
            health.get("kra_model"),
            health.get("ora_model"),
        )
    except Exception:
        from core.llm_engine import LLMEngine
        logger.error("LLM preload failed — models are unavailable until the environment issue is fixed")
        logger.error("LLM diagnostics: %s", LLMEngine.diagnostics())
        logger.exception("LLM preload exception")

    # ── Eagerly preload FAISS indexes so first search is fast ──
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
        logger.warning("FAISS index preload failed — first search will be slower")
        logger.exception("FAISS preload exception")

    logger .info ("System ready!")
    yield 

    logger .info ("Shutting down...")

app =FastAPI (
title ="KRA-ORA Medical Analysis API",
description ="AI-powered medical diagnosis support system with knowledge retrieval and reasoning",
version ="2.0.0",
lifespan =lifespan 
)

app .add_middleware (

CORSMiddleware ,

allow_origins =[
"http://localhost:3000",
"http://localhost:5173",

os .getenv ("FRONTEND_URL","http://localhost:3000")

],

allow_credentials =True ,
allow_methods =["*"],
allow_headers =["*"],

)

if LOCAL_MODE :
    # Local-mode routes expose the simplified one-shot diagnosis flow.
    app .include_router (local_analysis .router ,prefix ="/api/analysis",tags =["Analysis"])

else :

    # Cloud-mode routes keep auth, admin, and the session-based
    # analysis workflow connected to the same FastAPI application.
    app .include_router (auth .router ,prefix ="/api/auth",tags =["Authentication"])
    app .include_router (analysis .router ,prefix ="/api/analysis",tags =["Analysis"])
    app .include_router (admin .router ,prefix ="/api/admin",tags =["Admin"])

# Strict workflow state machine endpoints (Phase A)
# These endpoints power the step-by-step frontend session flow and the SSE
# stream that listens for progress events from WorkflowService.
app .include_router (workflow .router ,prefix ="/api/workflow/v1",tags =["Workflow v1"])




@app .get ("/health")

async def health_check ():
    """Health check endpoint"""
    return {
    "status":"healthy",
    "timestamp":datetime .utcnow ().isoformat (),
    "version":"2.0.0"

    }


@app.get("/health/schema")
async def schema_check():
    """Check that all required Supabase columns exist."""
    from processing.supabase_payload import verify_schema
    result = verify_schema()
    return result

@app .get ("/")

async def root ():
    """Root endpoint with API information"""

    return {
    "name":"KRA-ORA Medical Analysis API",
    "version":"2.0.0",
    "docs":"/docs",
    "health":"/health"
    }





def get_retriever ()->"SupabaseRetriever" :

    """Dependency to get retriever instance"""

    if retriever is None :
        raise HTTPException (
        status_code =status .HTTP_503_SERVICE_UNAVAILABLE ,
        detail ="Retriever not initialized"
        )

    return retriever 

def get_embedding_service ()->"EmbeddingService" :
    """Dependency to get embedding service instance"""
    if embedding_service is None :
        raise HTTPException (
        status_code =status .HTTP_503_SERVICE_UNAVAILABLE ,
        detail ="Embedding service not initialized"
        )

    return embedding_service 

if __name__ =="__main__":

    import uvicorn 
    port =int (os .getenv ("PORT",8080 ))
    uvicorn .run (
    "main:app",
    host ="0.0.0.0",
    port =port ,
    reload =True ,
    log_level ="info"
    )