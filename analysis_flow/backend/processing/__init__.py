"""
backend/processing — KRA-ORA 7-step pipeline package.

Provides:
  session_store     — local SQLite session tracker
  supabase_payload  — Supabase CRUD for analysis data
  search_service    — FAISS retrieval wrapper
  kra_client        — local KRA inference client
  ora_client        — local ORA inference client
  schemas           — Pydantic request/response models
  workflow_service  — main orchestrator
"""
from .pipeline_service import PipelineService, PipelineResult

__all__ = ["PipelineService", "PipelineResult"]
