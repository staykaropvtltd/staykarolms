-- ============================================================
-- StayKaro LMS — Performance Index Migration
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- All indexes use CONCURRENTLY so they build without locking writes.
-- Safe to re-run: IF NOT EXISTS guards every statement.
-- ============================================================

-- ── profiles ─────────────────────────────────────────────────
-- Used by: analytics (role+institution counts), notifications publish, auth middleware
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_institution_id
  ON profiles (institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_institution_role
  ON profiles (institution_id, role);

-- ── notifications ─────────────────────────────────────────────
-- Most frequent read endpoint; every page load fetches unread count
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_read
  ON notifications (user_id, read)
  WHERE read = false;

-- ── messages ──────────────────────────────────────────────────
-- OR filter (sender_id OR receiver_id) benefits from two separate indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_sender_id
  ON messages (sender_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_receiver_id
  ON messages (receiver_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_receiver_unread
  ON messages (receiver_id, read)
  WHERE read = false;

-- ── enrollments ────────────────────────────────────────────────
-- Used by: courses list (student), attendance analytics, assignment analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollments_student_id
  ON enrollments (student_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollments_course_id
  ON enrollments (course_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollments_student_course
  ON enrollments (student_id, course_id);

-- ── attendance ─────────────────────────────────────────────────
-- Used by: student attendance view, course attendance, admin analytics (with profiles join)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_student_id
  ON attendance (student_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_course_id
  ON attendance (course_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_student_course_date
  ON attendance (student_id, course_id, date DESC);

-- ── tests ─────────────────────────────────────────────────────
-- Used by: test list (institution scoped), batch tests, published tests for students
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tests_institution_id
  ON tests (institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tests_batch_id
  ON tests (batch_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tests_institution_status
  ON tests (institution_id, status);

-- ── test_questions ─────────────────────────────────────────────
-- Used by: test detail (fetch all questions for a test), answer save (FK lookup)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_test_questions_test_id
  ON test_questions (test_id, order_index);

-- ── test_attempts ──────────────────────────────────────────────
-- MOST CRITICAL: hit on every exam start, answer save, and submit
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_test_attempts_test_id
  ON test_attempts (test_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_test_attempts_student_id
  ON test_attempts (student_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_test_attempts_test_student_status
  ON test_attempts (test_id, student_id, status);

-- ── test_answers ───────────────────────────────────────────────
-- Used by: answer upsert, submit (grade all answers), result view
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_test_answers_attempt_id
  ON test_answers (attempt_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_test_answers_attempt_question
  ON test_answers (attempt_id, question_id);

-- ── assignments ────────────────────────────────────────────────
-- Used by: assignment list (course scoped), faculty submissions filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assignments_course_id
  ON assignments (course_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assignments_created_by
  ON assignments (created_by);

-- ── assignment_submissions ─────────────────────────────────────
-- Used by: student submissions view, faculty grading, admin analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assignment_submissions_student_id
  ON assignment_submissions (student_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assignment_submissions_assignment_id
  ON assignment_submissions (assignment_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assignment_submissions_grade
  ON assignment_submissions (assignment_id, grade)
  WHERE grade IS NULL;

-- ── courses ────────────────────────────────────────────────────
-- Used by: course list (institution scoped), faculty courses
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_courses_institution_id
  ON courses (institution_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_courses_faculty_id
  ON courses (faculty_id);

-- ── batches ────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_batches_institution_id
  ON batches (institution_id);

-- ── batch_students ─────────────────────────────────────────────
-- Used by: test publish (notify batch students), batch detail
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_batch_students_batch_id
  ON batch_students (batch_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_batch_students_student_id
  ON batch_students (student_id);

-- ── ai_sessions ────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_sessions_student_id
  ON ai_sessions (student_id, created_at DESC);

-- ── certificates ───────────────────────────────────────────────
-- Used by: completion check (student + course unique lookup)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_certificates_student_course
  ON certificates (student_id, course_id);

-- ── lesson_completions ─────────────────────────────────────────
-- Used by: progress tracking (student + course + content)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lesson_completions_student_course
  ON lesson_completions (student_id, course_id);

-- ── calendar_events ────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calendar_events_institution_id
  ON calendar_events (institution_id, scheduled_at);

-- ── audit_logs ─────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_actor_id
  ON audit_logs (actor_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs (created_at DESC);

-- ── support_tickets ────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_support_tickets_status
  ON support_tickets (status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_support_tickets_user_id
  ON support_tickets (user_id);

-- ── live_classes ───────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_live_classes_institution_id
  ON live_classes (institution_id, scheduled_at);

-- ============================================================
-- VERIFY: run this after to confirm all indexes are present
-- SELECT indexname, tablename FROM pg_indexes
-- WHERE schemaname = 'public'
-- AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
-- ============================================================
