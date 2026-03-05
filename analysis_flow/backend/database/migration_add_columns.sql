-- ============================================================
-- MIGRATION: Add missing columns to Supabase tables
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- Required for the Phase B/C analysis pipeline to work
-- ============================================================

BEGIN;

-- ==============================
-- analysis_payloads: Add missing columns
-- ==============================
ALTER TABLE public.analysis_payloads
  ADD COLUMN IF NOT EXISTS symptoms_json jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS history_json jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS context_text text DEFAULT '',
  ADD COLUMN IF NOT EXISTS quality_json jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- ==============================
-- kra_outputs: Add missing columns
-- ==============================
ALTER TABLE public.kra_outputs
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS symptoms_text text,
  ADD COLUMN IF NOT EXISTS kra_output jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS raw_text text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- ==============================
-- ora_outputs: Add missing columns
-- ==============================
ALTER TABLE public.ora_outputs
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS experience_level text,
  ADD COLUMN IF NOT EXISTS refined_output text DEFAULT '',
  ADD COLUMN IF NOT EXISTS disclaimer text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- ==============================
-- Refresh the PostgREST schema cache so new columns are visible immediately
-- ==============================
NOTIFY pgrst, 'reload schema';

COMMIT;
