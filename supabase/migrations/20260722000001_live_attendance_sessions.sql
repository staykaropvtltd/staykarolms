-- Live attendance sessions: faculty opens a timed window, students self-mark
CREATE TABLE IF NOT EXISTS live_attendance_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id     UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  course_id    UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  faculty_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Student self-mark responses linked to a session
CREATE TABLE IF NOT EXISTS live_attendance_responses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES live_attendance_sessions(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  marked_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, student_id)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_live_sessions_batch    ON live_attendance_sessions(batch_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_faculty  ON live_attendance_sessions(faculty_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_expires  ON live_attendance_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_live_responses_session ON live_attendance_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_live_responses_student ON live_attendance_responses(student_id);

-- RLS: faculty/admin can manage sessions; students can read sessions for their batch
ALTER TABLE live_attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_attendance_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "faculty_admin_manage_sessions" ON live_attendance_sessions
  FOR ALL USING (
    auth.uid() = faculty_id
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super-admin')
    )
  );

CREATE POLICY "students_read_sessions" ON live_attendance_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM batch_students
      WHERE batch_id = live_attendance_sessions.batch_id
        AND student_id = auth.uid()
    )
  );

CREATE POLICY "students_manage_own_response" ON live_attendance_responses
  FOR ALL USING (student_id = auth.uid());

CREATE POLICY "faculty_read_responses" ON live_attendance_responses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM live_attendance_sessions s
      WHERE s.id = live_attendance_responses.session_id
        AND (
          s.faculty_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super-admin')
          )
        )
    )
  );
