# Analysis Flow Backend (Single-Mode) - End-to-End Execution

This backend now runs in one execution model only: the workflow session model exposed at `/api/workflow/v1`.

There is no separate local-mode route stack in the active backend app.

## 1. Active Runtime Entry

Primary entrypoint: `analysis_flow/backend/main.py`

Startup sequence:
1. Load environment via `load_dotenv(find_dotenv(), override=True)`.
2. Apply Windows selector event-loop policy when running on Windows.
3. Run lifespan warmup:
   - Supabase schema check via `verify_schema()`.
   - Inference provider readiness check via `WorkflowService.readiness_status()`.
   - FAISS readiness preload via `SearchService().readiness_status()`.
4. Register one router only:
   - `app.include_router(workflow.router, prefix="/api/workflow/v1", tags=["Workflow v1"])`

Other app endpoints:
- `GET /health`
- `GET /health/schema`
- `GET /`

## 2. Public API Surface (Single Mode)

Defined in `analysis_flow/backend/routes/workflow.py`.

Session and step APIs:
1. `POST /session/init`
2. `GET /session/{session_id}`
3. `POST /session/{session_id}/extraction`
4. `POST /session/{session_id}/ecg`
5. `POST /session/{session_id}/lab`
6. `POST /session/{session_id}/analysis/run`
7. `POST /session/{session_id}/analysis/stop`
8. `GET /session/{session_id}/analysis/events` (SSE)

History/cleanup APIs:
1. `GET /patient/{patient_id}/history`
2. `DELETE /patient/{patient_id}/cleanup`
3. `DELETE /history/{payload_id}`

## 3. Workflow State Machine

State enum in `analysis_flow/backend/processing/workflow_state.py`:
- `SESSION_CREATED`
- `EXTRACTION_DONE`
- `ECG_DONE`
- `LAB_DONE`
- `ANALYSIS_RUNNING`
- `ANALYSIS_DONE`
- `FAILED`

Allowed transitions:
- `SESSION_CREATED -> EXTRACTION_DONE | FAILED`
- `EXTRACTION_DONE -> ECG_DONE | LAB_DONE | ANALYSIS_RUNNING | FAILED`
- `ECG_DONE -> LAB_DONE | ANALYSIS_RUNNING | FAILED`
- `LAB_DONE -> ANALYSIS_RUNNING | FAILED`
- `ANALYSIS_RUNNING -> ANALYSIS_DONE | FAILED | LAB_DONE` (rollback/cancel)
- `ANALYSIS_DONE -> ANALYSIS_RUNNING | FAILED` (re-run)

Idempotency behavior:
- Implemented in `WorkflowStore.save_step()`.
- If current state is already at or past the requested step state, it returns existing saved payload/revision instead of failing.

## 4. Persistence Layers

### Local Session DB (SQLite)

Managed by `analysis_flow/backend/processing/workflow_store.py`.
Default DB path:
- `analysis_flow/backend/database/session_temp.db`

Tables:
1. `sessions`
2. `step_payloads`
3. `orchestration_events`
4. `retrieval_context`

Key responsibilities:
- Create session rows (`create_session`)
- Persist extraction/ecg/lab step payloads (`save_step`)
- Transition workflow state (`transition_state`)
- Record retrieval context chunks (`save_retrieval_context`)
- Store Supabase linkage IDs (`set_supabase_payload_id`, `set_supabase_kra_id`, `set_supabase_ora_id`)
- Cleanup per session (`delete_session`)

### Supabase Persistence

Used through `analysis_flow/backend/processing/supabase_payload.py`.
Called by workflow service for:
- payload snapshot save
- KRA output save
- ORA output save
- payload status updates
- patient history bundle fetch
- cleanup/delete operations

Fallback behavior:
- Pipeline continues with generated local UUIDs if Supabase write fails.
- Response marks `supabase_available` accordingly.

## 5. End-to-End Run Path (analysis/run)

Main orchestrator: `WorkflowService.run_analysis()` in `analysis_flow/backend/processing/workflow_service.py`.

## Phase A - Route thread handoff

Route: `POST /session/{session_id}/analysis/run`
- Async FastAPI handler uses `loop.run_in_executor(...)`.
- Heavy analysis work runs in a worker thread.

## Phase B - Session validation and state prep

In `run_analysis()`:
1. Clear prior cancel request for the session.
2. Load session from SQLite.
3. If state is stuck `ANALYSIS_RUNNING`, reset to `LAB_DONE` for retry.
4. If state is `ANALYSIS_DONE`, move to `ANALYSIS_RUNNING` for rerun.
5. Ensure state is one of ready states (`EXTRACTION_DONE`, `ECG_DONE`, `LAB_DONE`) or already running.
6. Load latest extraction/ecg/lab payloads.
7. Require extraction payload; ecg/lab may be auto-marked skipped.
8. Transition state to `ANALYSIS_RUNNING` if not already there.

## Phase C - Input normalization

In `_run_analysis_pipeline()`:
- Normalize extraction to `symptoms_json` and `symptoms_text`.
- Normalize ECG payload to unified fields (`rhythm`, `heart_rate`, findings, etc.).
- Normalize lab payload to key markers (`troponin`, `ldh`, `bnp`, etc.) and findings.
- Emit event: `session_init/completed`.

## Phase D - Retrieval

1. Emit `faiss_search/started`.
2. `SearchService.search_textbook(...)` returns:
   - `patient_vector`
   - textbook context
   - quality metadata
3. Save textbook retrieval context to SQLite.
4. Decide rare-case search gate via `should_search_rare_cases(...)`.
5. If gated on:
   - emit `rare_case_search/started`
   - run `search_rare_cases(...)`
   - save rare retrieval context to SQLite
   - emit rare-case completion
6. If gated off:
   - emit rare-case skipped/completed

## Phase E - Parallel history + payload save + KRA

Pipeline overlaps steps to reduce total latency:
1. Fetch patient history bundle (`get_patient_history_bundle`) first.
2. In parallel:
   - save payload snapshot (`save_analysis_payload`)
   - run KRA model analysis (`KRAClient.analyze`)
3. Timeout and cancellation controls:
   - KRA timeout controlled by `KRA_TIMEOUT_SEC` (min 30s, default 900s)
   - cancel event propagated to model call
4. Validate KRA output structure (`diagnoses`, `uncertainties`, `recommended_tests`, `red_flags`).
5. Emit completed events:
   - `supabase_save_payload`
   - `kra_analysis`

## Phase F - Parallel KRA persist + ORA refinement

1. Start KRA persistence (`save_kra_output`).
2. Run ORA for both levels in parallel:
   - `NEWBIE`
   - `SEASONED`
3. Primary requested level must succeed.
4. Secondary level is best-effort; if missing, synthesize deterministic fallback text from the available level.
5. Emit completed events:
   - `supabase_save_kra`
   - `ora_refinement`

## Phase G - Persist ORA + finalize session

1. Persist available ORA outputs (`save_ora_output`) per level.
2. Emit `supabase_save_ora/completed`.
3. Save selected ORA id to SQLite session.
4. If persistence was successful, set payload status to `completed`.
5. Transition state to `ANALYSIS_DONE`.
6. Emit terminal event `analysis_done/completed`.
7. Return final response object including:
   - supabase IDs/URLs
   - `processing_steps`
   - `kra_raw`
   - `ora_outputs` + `ora_disclaimers`
   - selected `refined_output` + `disclaimer`
   - `rare_case_alert`
   - `total_duration_ms`
   - `context_preview`

## 6. Cancellation Path

Route: `POST /session/{session_id}/analysis/stop`

Flow:
1. `request_stop_analysis()` marks session in `_cancel_requested` set.
2. Signals per-session threading event (if active) to interrupt model call promptly.
3. Worker thread checkpoints call `_raise_if_cancelled()`.
4. On cancel:
   - rollback transition to `LAB_DONE`
   - emit `cancelled/cancelled`
   - route maps to HTTP 409 path for cancellation case
5. Session event bus is closed in `finally` via EOF signal.

## 7. SSE Real-Time Events

Route: `GET /session/{session_id}/analysis/events`

Mechanics:
1. Route subscribes to `PipelineEventBus` queue for session.
2. Async generator blocks on queue with timeout.
3. On timeout, emits heartbeat comment `: keep-alive`.
4. Emits SSE lines as `data: {json}`.
5. Closes on terminal conditions:
   - step == `analysis_done`
   - status in `{error, cancelled}`
   - internal `__eof__` signal
6. Unsubscribes queue in `finally`.

Typical event sequence:
1. `session_init/completed`
2. `faiss_search/started`
3. `faiss_search/completed`
4. `rare_case_search/completed` (or started+completed)
5. `supabase_save_payload/started`
6. `kra_analysis/started`
7. `supabase_save_payload/completed`
8. `kra_analysis/completed`
9. `supabase_save_kra/started`
10. `ora_refinement/started`
11. `supabase_save_kra/completed`
12. `ora_refinement/completed`
13. `supabase_save_ora/started`
14. `supabase_save_ora/completed`
15. `analysis_done/completed`

## 8. Error and Rollback Behavior

Route-level behavior (`workflow.py`):
- Session missing: 404 and emit `analysis_done/error`.
- Runtime cancellation conflict: 409 and emit `analysis_done/cancelled`.
- Other runtime/unknown failures: 500 and emit `analysis_done/error`.

Service-level behavior (`workflow_service.py`):
- On non-cancel errors during run: rollback state to `LAB_DONE` when possible.
- Always close SSE subscribers with EOF in `finally`.
- Always clear cancel flags in `finally`.

## 9. Single-Mode Architecture Diagram

```mermaid
flowchart LR
   FE[Frontend Next.js React]

   subgraph API[FastAPI backend/main.py]
      INIT[POST /session/init]
      EXT[POST /session/{id}/extraction]
      ECG[POST /session/{id}/ecg]
      LAB[POST /session/{id}/lab]
      RUN[POST /session/{id}/analysis/run]
      STOP[POST /session/{id}/analysis/stop]
      EVT[GET /session/{id}/analysis/events SSE]
      HIST[GET /patient/{patient_id}/history]
      CLN[DELETE /patient/{patient_id}/cleanup]
   end

   subgraph SVC[WorkflowService processing/workflow_service.py]
      ORCH[run_analysis orchestrator]
      BUS[PipelineEventBus]
      CANCEL[cancel flags and thread events]
   end

   subgraph STORE[WorkflowStore SQLite]
      SESS[sessions]
      STEP[step_payloads]
      ORCHLOG[orchestration_events]
      RETCTX[retrieval_context]
   end

   subgraph SEARCH[Retrieval]
      SS[SearchService]
      FAISS[FAISS textbook index]
      RARE[Rare case index]
   end

   subgraph MODELS[Model layer]
      KRA[KRAClient analyze]
      ORA[ORAClient refine NEWBIE and SEASONED]
   end

   subgraph CLOUD[Supabase persistence]
      PAY[analysis_payloads]
      KOUT[kra_outputs]
      OOUT[ora_outputs]
      HB[get_patient_history_bundle]
      DEL[delete patient data]
   end

   FE -->|HTTP| INIT
   FE -->|HTTP| EXT
   FE -->|HTTP| ECG
   FE -->|HTTP| LAB
   FE -->|HTTP| RUN
   FE -->|HTTP| STOP
   FE -->|SSE subscribe| EVT
   FE -->|HTTP| HIST
   FE -->|HTTP| CLN

   INIT --> ORCH
   EXT --> ORCH
   ECG --> ORCH
   LAB --> ORCH
   RUN --> ORCH
   STOP --> CANCEL
   EVT --> BUS

   ORCH --> SESS
   ORCH --> STEP
   ORCH --> ORCHLOG
   ORCH --> RETCTX

   ORCH --> SS
   SS --> FAISS
   SS --> RARE
   SS --> ORCH

   ORCH --> KRA
   ORCH --> ORA

   ORCH --> PAY
   ORCH --> KOUT
   ORCH --> OOUT
   ORCH --> HB
   ORCH --> DEL

   ORCH --> BUS
   BUS -->|step events and terminal event| EVT
   EVT -->|data: json| FE
```

Read path summary:
1. Frontend drives stateful steps through workflow endpoints.
2. `run_analysis` enters `WorkflowService`, which coordinates SQLite state, retrieval, and model calls.
3. Progress is emitted through `PipelineEventBus` and streamed via SSE.
4. Results and longitudinal history are persisted to Supabase with local fallback behavior.

## 10. Presentation Summary (Current Reality)

1. Backend has one mode now: workflow session mode.
2. All analysis is routed through `/api/workflow/v1`.
3. State-driven orchestration controls idempotency, retries, and cancellation.
4. Retrieval + model inference are event-streamed via SSE for real-time UI progress.
5. SQLite is operational state storage; Supabase is longitudinal persistence with offline fallback.
