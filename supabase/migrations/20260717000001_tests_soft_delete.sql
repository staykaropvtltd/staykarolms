-- Soft-delete support for the tests table.
-- Physical deletion is blocked by FK constraints from test_attempts.
-- Archiving hides tests from students and normal views while preserving
-- all attempt records, scores, and analytics history.
--
-- Run in Supabase SQL Editor or via `supabase db push`.

ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS is_archived  BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  UUID        REFERENCES profiles (id) ON DELETE SET NULL;

-- Fast filter for the common query pattern: active tests by institution
CREATE INDEX IF NOT EXISTS idx_tests_is_archived
  ON tests (is_archived, institution_id);
