-- Timeline + integrity fields for test_attempts
ALTER TABLE test_attempts
  ADD COLUMN IF NOT EXISTS auto_submitted   BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_answered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS correct_count    INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wrong_count      INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS answered_count   INTEGER      NOT NULL DEFAULT 0;

-- Backfill counts for already-submitted attempts
UPDATE test_attempts ta
SET
  answered_count = (
    SELECT COUNT(*) FROM test_answers a
    WHERE a.attempt_id = ta.id
      AND a.answer IS NOT NULL AND a.answer <> ''
  ),
  correct_count = (
    SELECT COUNT(*) FROM test_answers a
    WHERE a.attempt_id = ta.id AND a.is_correct = TRUE
  ),
  wrong_count = (
    SELECT COUNT(*) FROM test_answers a
    WHERE a.attempt_id = ta.id AND a.is_correct = FALSE
      AND a.answer IS NOT NULL AND a.answer <> ''
  )
WHERE ta.status = 'submitted';

-- Analytics query indexes
CREATE INDEX IF NOT EXISTS idx_test_attempts_test_status
  ON test_attempts (test_id, status);

CREATE INDEX IF NOT EXISTS idx_test_attempts_submitted_score
  ON test_attempts (test_id, score DESC NULLS LAST)
  WHERE status = 'submitted';

CREATE INDEX IF NOT EXISTS idx_test_answers_attempt
  ON test_answers (attempt_id);
