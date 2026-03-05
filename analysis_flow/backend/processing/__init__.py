"""
backend/processing — KRA-ORA 7-step pipeline package.

Provides:
  session_store     — local SQLite session tracker
  supabase_payload  — Supabase CRUD for analysis data
  search_service    — FAISS retrieval wrapper
  kra_client        — KRA HuggingFace Space client
  ora_client        — ORA HuggingFace Space client
  schemas           — Pydantic request/response models
  pipeline_service  — main orchestrator
"""
from .pipeline_service import PipelineService, PipelineResult

__all__ = ["PipelineService", "PipelineResult"]
