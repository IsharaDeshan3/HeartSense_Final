# HeartSense AI — Architecture & Design Decisions

This document records the 12 deliberate architectural decisions made during the
Phase C integration sprint.  It is the authoritative reference for any developer
working on this codebase.

---

## 1 · HF Space App Files — Canonical Location

**Decision:** KRA and ORA HuggingFace Space source files live at:

```
analysis_flow/hf_spaces/kra/app.py
analysis_flow/hf_spaces/ora/app.py
```

Each sub-folder contains its own `requirements.txt` and `README.md` and is
pushed to the corresponding HF Space repository.  The legacy copies that were
stored under `analysis_flow/recycle/` or `analysis_flow/tmp_hf_spaces/` are
**superseded** and must not be deployed.

---

## 2 · Stop Analysis — Cancel-Flag Only

**Decision:** `WorkflowService.request_stop_analysis()` **only** sets an
internal cancel flag (`_cancel_requested`).  It does **not** call
`_store.transition_state()`.

**Rationale:** The pipeline worker thread runs in a thread-pool executor.  Any
state transition issued from the HTTP handler would race with the rollback that
the worker itself performs once it detects the cancel flag.  The worker is the
sole authority on state transitions during a running pipeline; the stop handler
is just a signal sender.

---

## 3 · HF Space Client Files — Source of Truth

**Decision:** `kra_client.py` and `ora_client.py` are the **only** callers of
the HuggingFace Spaces.  No other module should call a Space directly.

- KRA fn_index = 0 (`analyze_from_supabase`), **3-argument** call:
  `[payload_id, temperature, show_reasoning]`.  The `model_choice` parameter
  was removed from the Space; the model is always configured via the Space
  secret `HF_MODEL` (default: `Phi-3-mini-4k-instruct`).
- ORA fn_index = 1 (`refine_from_supabase`), 2-argument call:
  `[kra_output_id, experience_level]`.

Both clients include an exponential-backoff retry loop (up to 3 attempts,
configurable via `KRA_MAX_RETRIES` / `ORA_MAX_RETRIES`) and an offline
local-agent fallback (see §6).

---

## 4 · Supabase Double-Hop — Data Integrity Design

**Decision:** The pipeline deliberately saves data to Supabase *before* sending
it to the HuggingFace Spaces.  The HF Spaces then **fetch the data directly
from Supabase** rather than receiving it inline.

**Rationale:**
- Supabase is the single source of truth; every pipeline run is fully auditable.
- The analysis payload, KRA output, and ORA output are all persisted as separate
  rows, enabling re-runs, partial retries, and compliance review.
- The double-hop is intentional and must be preserved.

**Fallback:** If Supabase is unavailable (cold-start race, network outage), the
pipeline degrades gracefully: a local UUID is used as the payload ID, the HF
Space call is skipped, and `KRAAgent` / `ORAAgent` run locally.  All downstream
callers must forward the `supabase_available` flag returned in the response.

---

## 5 · Real-Time Pipeline Step Streaming (SSE)

**Decision:** The backend exposes a Server-Sent Events endpoint:

```
GET /api/workflow/v1/session/{session_id}/analysis/events
```

The frontend calls `WorkflowService.openAnalysisEventStream(sessionId)`
**before** calling `/analysis/run`, subscribes to message events, and updates
the pipeline progress UI in real time.  Each event is a JSON object:

```json
{ "step": "kra_analysis", "status": "started" }
{ "step": "kra_analysis", "status": "completed", "duration_ms": 3210 }
{ "step": "analysis_done", "status": "completed" }
```

The stream closes automatically when `analysis_done` is received.

**Implementation:** `PipelineEventBus` in `workflow_service.py` maintains a
`queue.Queue` per session.  The pipeline worker calls `_emit()` at each
checkpoint.  The SSE endpoint polls the queue and forwards events.

---

## 6 · ORA Agent — Unified Offline Fallback

**Decision:** `ora_client.py` absorbs the local-fallback responsibility that was
previously split between `ora_agent.py` and `ora_client.py`.  The call path is:

1. Try ORA HF Space (with retries).
2. If `ORA_ENDPOINT` is empty **or** all retries fail: call `ORAAgent(use_local=True).refine(...)`.

Callers outside `workflow_service.py` must not bypass `ora_client.py` to call
`ORAAgent` directly.

The same pattern applies to `kra_client.py` → `KRAAgent(use_local=True)`.

---

## 7 · Client-Side Gemini API Key (No Proxy)

**Decision:** The frontend calls the Gemini API directly using
`NEXT_PUBLIC_GEMINI_API_KEY` on the client side.  There is no backend proxy.

**Rationale:** This keeps the extraction flow entirely frontend-driven and avoids
adding a Gemini proxy to the backend.  The API key is scoped to the Gemini text
API only and the project is private.

**Security Note:** Any client-side API key is visible in the browser DevTools.
This is an accepted risk for an internal/clinical tool.  If the project ever
becomes public-facing, move the Gemini call to a server action or API route and
remove the `NEXT_PUBLIC_` prefix.  This decision is tracked here so it is not
accidentally forgotten.

---

## 8 · Idempotent Step Saves / State-Machine Rigidity

**Decision:** `WorkflowStore.save_step()` is idempotent: if the session's
current state is already at or beyond the target state, the method returns the
existing payload rather than raising a 409 Conflict.

`ALLOWED_TRANSITIONS` (`workflow_state.py`) includes skip paths to support
optional pipeline steps:

- `EXTRACTION_DONE → LAB_DONE` (skip ECG)
- `EXTRACTION_DONE → ANALYSIS_RUNNING` (skip ECG + Lab)
- `ECG_DONE → ANALYSIS_RUNNING` (skip Lab)
- `LAB_DONE → ANALYSIS_RUNNING`
- `ANALYSIS_DONE → ANALYSIS_RUNNING` (re-run)

This ensures the pipeline survives connection drops, partial retries, and
frontend-driven step skipping without corrupting the session state.

---

## 9 · HF Space Health Checks

**Decision:** `WorkflowService.check_spaces_health()` hits `/config` on both
HF Space endpoints and returns a dict:

```python
{"kra": True, "ora": False, "all_healthy": False}
```

This method is called at startup (logged, not fatal) and can be called by an
admin endpoint or monitoring job.  The primary purpose is early detection of
cold-start issues before a patient session begins.

---

## 10 · SQLite + Supabase Dual Storage

**Decision:** Local SQLite (via `WorkflowStore`) and Supabase are both kept.

- **SQLite** holds the session state machine, step payloads, and metadata.  It
  is the local source of truth for workflow state.
- **Supabase** holds the analysis payload, KRA output, and ORA output rows.  The
  HF Spaces read from Supabase.

`check_existing_payload(session_id)` is called before every `save_analysis_payload`
call to prevent duplicate Supabase rows on pipeline retries.  The `pipeline_run_id`
(local UUID) recorded in SQLite can be used to correlate runs in case of
Supabase sync gaps.

---

## 11 · Gradio SSE Retries

**Decision:** Both `kra_client.py` and `ora_client.py` implement an
exponential-backoff retry loop around the Gradio SSE queue call:

- Up to `KRA_MAX_RETRIES` / `ORA_MAX_RETRIES` attempts (default: 3).
- Sleep between attempts: `2^(attempt-1)` seconds (1 s, 2 s, 4 s).
- After all retries are exhausted, `ora_client.py` falls back to the local ORA
  agent.  `kra_client.py` raises, which triggers the `supabase_available=False`
  fallback path in `workflow_service.py`.

This handles HF Space cold-starts and transient network timeouts without
surfacing errors to the end user.

---

## 12 · No Authentication Between Services

**Decision:** There is no authentication between the Next.js frontend, the
workflow FastAPI backend, and the analysis pipeline.  All inter-service calls
within the local deployment are unauthenticated.

**Rationale:** This is an internal clinical tool deployed on a closed network
(localhost or private VPC).  Adding service-to-service auth would add
operational complexity without meaningful security benefit in the current
deployment model.

**Future Migration Path:** If the system is deployed as a public-facing SaaS:
1. Add an `Authorization: Bearer <service_token>` header to inter-service calls.
2. Validate the token in FastAPI middleware using a shared secret or JWT.
3. Add row-level security (RLS) to Supabase tables.
This decision is documented here to ensure the security posture is explicit and
not accidentally overlooked.

---

*Last updated: 2026-03-05 — Phase C integration sprint.*
