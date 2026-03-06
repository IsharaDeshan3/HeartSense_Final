# HeartSense AI — Current Architecture

## Runtime flow

1. The doctor workspace creates a workflow session in `analysis_flow`.
2. Symptoms, ECG, and lab data are saved as workflow step payloads.
3. `WorkflowService` runs a local-first analysis pipeline:
   - textbook FAISS retrieval first
   - rare-case retrieval only when the uncertainty gate triggers
   - Supabase history summary fetch for prior patient context
   - payload persistence and KRA reasoning in parallel
   - KRA history persistence and ORA refinement in parallel
   - final ORA persistence
4. The KRA output is sent directly to ORA in memory.
5. Supabase stores the canonical diagnostic history.

## Storage responsibilities

- Supabase: canonical diagnostic history and audit records
- SQLite workflow store: local session/state tracking only
- Lab backend: patientId-keyed lab report history
- Mongo patient registry: demographic/registry data only

## Reasoning rules

- Prior history is injected into KRA only.
- ORA refines the current KRA output only.
- Supabase is used as historical memory, not as runtime input for ORA.
- Rare-case retrieval is conditional on uncertainty.

## Frontend flow

- Doctor dashboard patient click opens the patient history page first.
- The history page shows the longitudinal Supabase summary before starting a new case.
- Starting a new case opens the workspace and uses the workflow-only analysis path.

## Health endpoints

- Workflow health: `/api/workflow/v1/health`
- App health: `/health`

## Retired paths

The legacy direct `/api/process/*` analysis path is no longer mounted.
The old frontend direct-diagnostic proxy routes were removed.
