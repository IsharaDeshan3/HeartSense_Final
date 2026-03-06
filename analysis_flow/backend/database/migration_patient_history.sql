-- ═══════════════════════════════════════════════════════════════════════
-- HeartSense AI — Supabase Schema Migration: Patient History Support
-- ═══════════════════════════════════════════════════════════════════════
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- This is safe to run multiple times (all statements use IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Add patient_id column to all pipeline tables
ALTER TABLE analysis_payloads ADD COLUMN IF NOT EXISTS patient_id TEXT;
ALTER TABLE kra_outputs ADD COLUMN IF NOT EXISTS patient_id TEXT;
ALTER TABLE ora_outputs ADD COLUMN IF NOT EXISTS patient_id TEXT;

-- 2. Add created_at timestamps (with default = now)
ALTER TABLE analysis_payloads ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE kra_outputs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE ora_outputs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Add indexes for fast patient-based lookups
CREATE INDEX IF NOT EXISTS idx_payloads_patient ON analysis_payloads(patient_id);
CREATE INDEX IF NOT EXISTS idx_kra_patient ON kra_outputs(patient_id);
CREATE INDEX IF NOT EXISTS idx_ora_patient ON ora_outputs(patient_id);
CREATE INDEX IF NOT EXISTS idx_payloads_session ON analysis_payloads(session_id);
CREATE INDEX IF NOT EXISTS idx_kra_session ON kra_outputs(session_id);
CREATE INDEX IF NOT EXISTS idx_ora_session ON ora_outputs(session_id);

-- 4. Create a unified diagnosis history view
--    Joins all 3 tables by session/payload chain, ordered by newest first.
CREATE OR REPLACE VIEW diagnosis_history AS
SELECT
    ap.id AS payload_id,
    ap.patient_id,
    ap.session_id,
    ap.symptoms_json,
    ap.ecg_json,
    ap.labs_json,
    ap.context_text,
    ap.quality_json,
    ap.status,
    ap.created_at,
    ko.id AS kra_id,
    ko.kra_output,
    ko.raw_text AS kra_raw_text,
    oo.id AS ora_id,
    oo.experience_level,
    oo.refined_output,
    oo.disclaimer
FROM analysis_payloads ap
LEFT JOIN kra_outputs ko ON ko.payload_id = ap.id
LEFT JOIN ora_outputs oo ON oo.kra_output_id = ko.id
ORDER BY ap.created_at DESC;

-- Done!
-- Verify with: SELECT * FROM diagnosis_history LIMIT 5;
