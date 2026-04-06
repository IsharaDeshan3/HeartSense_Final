-- migration_workflow_resume_idempotency.sql
-- Purpose:
-- 1) Prevent duplicate final payload rows per workflow session.
-- 2) Add explicit draft-step persistence primitives for manual save/resume UX.
-- 3) Add idempotent commit tracking for payload/KRA/ORA/final phases.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) analysis_payloads hardening (duplicate prevention)
-- ---------------------------------------------------------------------------

-- Optional idempotency key for client/server retries.
ALTER TABLE IF EXISTS analysis_payloads
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Keep the most recent row per session_id, remove older duplicates.
WITH ranked AS (
    SELECT
        id,
        session_id,
        ROW_NUMBER() OVER (
            PARTITION BY session_id
            ORDER BY created_at DESC NULLS LAST, id DESC
        ) AS rn
    FROM analysis_payloads
    WHERE session_id IS NOT NULL
)
DELETE FROM analysis_payloads p
USING ranked r
WHERE p.id = r.id
  AND r.rn > 1;

-- Enforce one analysis_payload row per workflow session.
CREATE UNIQUE INDEX IF NOT EXISTS uq_analysis_payloads_session_id
    ON analysis_payloads (session_id)
    WHERE session_id IS NOT NULL;

-- Enforce optional idempotency key uniqueness for retried submissions.
CREATE UNIQUE INDEX IF NOT EXISTS uq_analysis_payloads_idempotency_key
    ON analysis_payloads (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Draft table for manual step-save and resume
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workflow_step_drafts (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    patient_id TEXT,
    step_name TEXT NOT NULL CHECK (step_name IN ('extraction', 'ecg', 'lab')),
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    payload_hash TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, step_name)
);

CREATE INDEX IF NOT EXISTS idx_workflow_step_drafts_patient
    ON workflow_step_drafts (patient_id);

CREATE INDEX IF NOT EXISTS idx_workflow_step_drafts_updated
    ON workflow_step_drafts (updated_at DESC);

-- ---------------------------------------------------------------------------
-- 3) Idempotent commit log for multi-phase final persistence
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS analysis_run_commits (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    patient_id TEXT,
    idempotency_key TEXT NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN ('payload', 'kra', 'ora', 'final')),
    payload_id TEXT,
    kra_id TEXT,
    ora_id TEXT,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (idempotency_key),
    UNIQUE (session_id, phase)
);

CREATE INDEX IF NOT EXISTS idx_analysis_run_commits_patient
    ON analysis_run_commits (patient_id);

CREATE INDEX IF NOT EXISTS idx_analysis_run_commits_status
    ON analysis_run_commits (status, updated_at DESC);

-- ---------------------------------------------------------------------------
-- Utility function: upsert draft payload and increment revision only on change
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION upsert_workflow_step_draft(
    p_session_id TEXT,
    p_patient_id TEXT,
    p_step_name TEXT,
    p_payload_json JSONB,
    p_payload_hash TEXT
) RETURNS workflow_step_drafts AS $$
DECLARE
    v_existing workflow_step_drafts;
    v_result workflow_step_drafts;
BEGIN
    SELECT *
      INTO v_existing
      FROM workflow_step_drafts
     WHERE session_id = p_session_id
       AND step_name = p_step_name
     LIMIT 1;

    IF NOT FOUND THEN
        INSERT INTO workflow_step_drafts (
            session_id,
            patient_id,
            step_name,
            payload_json,
            payload_hash,
            revision,
            status,
            created_at,
            updated_at
        ) VALUES (
            p_session_id,
            p_patient_id,
            p_step_name,
            COALESCE(p_payload_json, '{}'::jsonb),
            p_payload_hash,
            1,
            'draft',
            NOW(),
            NOW()
        )
        RETURNING * INTO v_result;

        RETURN v_result;
    END IF;

    IF COALESCE(v_existing.payload_hash, '') = COALESCE(p_payload_hash, '') THEN
        RETURN v_existing;
    END IF;

    UPDATE workflow_step_drafts
       SET patient_id = COALESCE(p_patient_id, patient_id),
           payload_json = COALESCE(p_payload_json, '{}'::jsonb),
           payload_hash = p_payload_hash,
           revision = revision + 1,
           updated_at = NOW()
     WHERE id = v_existing.id
     RETURNING * INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMIT;
