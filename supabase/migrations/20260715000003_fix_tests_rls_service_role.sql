-- Fix: tests INSERT/UPDATE/DELETE policies were blocking the backend service role.
-- auth.uid() is NULL for service_role connections, so the subquery in WITH CHECK
-- always returned 0 rows — causing "violates row-level security policy" errors.
-- The fix: allow when auth.role() = 'service_role' (the JWT role claim for the
-- Supabase service key), so the backend can always write without bypassing the
-- intent of the policy (which only targets direct client/anon access).
--
-- Additionally creates seed_load_test_exam() as SECURITY DEFINER so it can be
-- called via RPC from any role to re-seed load-test data without needing SQL Editor.

-- ── Fix INSERT policy ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tests_admin_insert" ON public.tests;
CREATE POLICY "tests_admin_insert" ON public.tests
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'faculty', 'super-admin')
        AND (p.role = 'super-admin' OR p.institution_id = tests.institution_id)
    )
  );

-- ── Fix UPDATE policy ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tests_admin_update" ON public.tests;
CREATE POLICY "tests_admin_update" ON public.tests
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'faculty', 'super-admin')
        AND (p.role = 'super-admin' OR p.institution_id = tests.institution_id)
    )
  );

-- ── Fix DELETE policy ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tests_admin_delete" ON public.tests;
CREATE POLICY "tests_admin_delete" ON public.tests
  FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super-admin')
        AND (p.role = 'super-admin' OR p.institution_id = tests.institution_id)
    )
  );

-- ── Fix test_questions policies (same issue) ─────────────────────────────────
DROP POLICY IF EXISTS "test_questions_institution_isolation" ON public.test_questions;
CREATE POLICY "test_questions_institution_isolation" ON public.test_questions
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.tests t ON t.id = test_questions.test_id
      WHERE p.id = auth.uid()
        AND (p.role = 'super-admin' OR p.institution_id = t.institution_id)
        AND (p.role != 'student' OR t.status = 'published')
    )
  );

CREATE POLICY IF NOT EXISTS "test_questions_service_write" ON public.test_questions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── SECURITY DEFINER seed function ──────────────────────────────────────────
-- Runs as the function owner (superuser) so RLS is bypassed entirely.
-- Safe: does not accept arbitrary SQL; only seeds a fixed named exam.
CREATE OR REPLACE FUNCTION public.seed_load_test_exam()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution_id UUID;
  v_creator_id     UUID;
  v_test_id        UUID;
  v_action         TEXT;
  v_q_action       TEXT;
  v_q_count        INT;
BEGIN
  SELECT institution_id INTO v_institution_id
  FROM public.profiles WHERE email = 'student@college.edu' LIMIT 1;
  IF v_institution_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No profile for student@college.edu');
  END IF;

  SELECT id INTO v_creator_id FROM public.profiles
  WHERE institution_id = v_institution_id AND role IN ('admin','faculty')
  ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END LIMIT 1;
  IF v_creator_id IS NULL THEN
    SELECT id INTO v_creator_id FROM public.profiles
    WHERE email = 'student@college.edu' LIMIT 1;
  END IF;

  SELECT id INTO v_test_id FROM public.tests
  WHERE title = 'Load Test Exam — MCQ Practice'
    AND institution_id = v_institution_id LIMIT 1;

  IF v_test_id IS NULL THEN
    INSERT INTO public.tests
      (title, type, status, duration_mins, institution_id, created_by, batch_id)
    VALUES
      ('Load Test Exam — MCQ Practice','aptitude','published',30,
       v_institution_id, v_creator_id, NULL)
    RETURNING id INTO v_test_id;
    v_action := 'created';
  ELSE
    UPDATE public.tests SET status = 'published' WHERE id = v_test_id;
    v_action := 'promoted';
  END IF;

  SELECT COUNT(*) INTO v_q_count FROM public.test_questions WHERE test_id = v_test_id;

  IF v_q_count = 0 THEN
    INSERT INTO public.test_questions
      (test_id, question, type, options, correct_answer, marks, order_index)
    VALUES
      (v_test_id,'What does HTTP stand for?','mcq',
       '["HyperText Transfer Protocol","High Transfer Text Protocol","Hyperlink Text Protocol","HyperText Template Protocol"]',
       'HyperText Transfer Protocol',2,1),
      (v_test_id,'Which data structure follows LIFO ordering?','mcq',
       '["Queue","Stack","Linked List","Binary Tree"]',
       'Stack',2,2),
      (v_test_id,'What is the time complexity of binary search?','mcq',
       '["O(n)","O(n²)","O(log n)","O(1)"]',
       'O(log n)',2,3),
      (v_test_id,'Which SQL keyword retrieves unique values?','mcq',
       '["UNIQUE","DISTINCT","ONLY","FILTER"]',
       'DISTINCT',2,4),
      (v_test_id,'Which HTTP method updates an existing resource?','mcq',
       '["GET","POST","PUT","DELETE"]',
       'PUT',2,5);
    v_q_action := 'seeded';
  ELSE
    v_q_action := 'already_exist';
  END IF;

  SELECT COUNT(*) INTO v_q_count FROM public.test_questions WHERE test_id = v_test_id;

  RETURN jsonb_build_object(
    'success',        true,
    'test_id',        v_test_id,
    'institution_id', v_institution_id,
    'test_action',    v_action,
    'questions',      v_q_action,
    'question_count', v_q_count
  );
END;
$$;

-- Grant execute to all roles so it can be called via RPC with any key
GRANT EXECUTE ON FUNCTION public.seed_load_test_exam() TO anon, authenticated, service_role;
