-- Anti-cheating: track tab-switch terminations and admin retake grants.
-- flagged_reason  — non-null when an attempt was auto-terminated (e.g. 'tab_switch')
-- retake_granted  — set to true by an admin/faculty to allow the student one more attempt

ALTER TABLE test_attempts
  ADD COLUMN IF NOT EXISTS flagged_reason    TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS retake_granted    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS retake_granted_by UUID        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS retake_granted_at TIMESTAMPTZ DEFAULT NULL;

-- Fast lookup: "does this student have a blocked attempt for this test?"
CREATE INDEX IF NOT EXISTS idx_test_attempts_flagged
  ON test_attempts (test_id, student_id, retake_granted)
  WHERE flagged_reason IS NOT NULL;
