-- Migration 001: Universal Import System
-- Run this in your Supabase SQL editor to enable full import tracking
-- and extended question fields.

-- ── Extended test_questions columns ────────────────────────────────────────────
-- Allow all 14 question types in the type column (no constraint added so existing
-- rows with 'mcq'/'coding'/'short' continue to work unchanged).

ALTER TABLE test_questions
  ADD COLUMN IF NOT EXISTS explanation    TEXT,
  ADD COLUMN IF NOT EXISTS difficulty     TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  ADD COLUMN IF NOT EXISTS tags           TEXT[],
  ADD COLUMN IF NOT EXISTS metadata       JSONB DEFAULT '{}'::jsonb;

-- ── Import jobs table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_jobs (
  id                TEXT        PRIMARY KEY,
  institution_id    TEXT        NOT NULL,
  test_id           TEXT        REFERENCES tests(id) ON DELETE SET NULL,
  created_by        TEXT        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'complete',
  file_name         TEXT        NOT NULL,
  file_type         TEXT        NOT NULL DEFAULT '',
  file_size         BIGINT      DEFAULT 0,
  total_questions   INTEGER     DEFAULT 0,
  inserted          INTEGER     DEFAULT 0,
  skipped           INTEGER     DEFAULT 0,
  failed_count      INTEGER     DEFAULT 0,
  error_log         JSONB       DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS import_jobs_inst_idx    ON import_jobs (institution_id);
CREATE INDEX IF NOT EXISTS import_jobs_test_idx    ON import_jobs (test_id) WHERE test_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS import_jobs_created_idx ON import_jobs (created_at DESC);

-- Row Level Security: admins see their institution's jobs
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_jobs_inst_policy ON import_jobs;
CREATE POLICY import_jobs_inst_policy ON import_jobs
  USING (institution_id = current_setting('app.current_institution_id', TRUE));
