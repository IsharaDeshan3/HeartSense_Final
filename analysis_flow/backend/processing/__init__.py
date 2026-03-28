"""
backend/processing — KRA-ORA 7-step pipeline package.

Provides:
  supabase_payload  — Supabase CRUD for analysis data
  search_service    — FAISS retrieval wrapper
  kra_client        — local KRA inference client
  ora_client        — local ORA inference client
  schemas           — Pydantic request/response models
  workflow_service  — main orchestrator (active pipeline)
  workflow_store    — SQLite-backed workflow session store
  workflow_state    — workflow state machine definitions
"""
