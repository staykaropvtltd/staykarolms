-- ============================================================
-- StayKaro LMS — Exam Seed Data
--
-- Creates one published MCQ test with 5 questions, visible to
-- all students in the same institution as student@college.edu.
-- This unblocks the k6 exam load test — without a published
-- test, VUs can only test the dashboard + tests-list endpoints
-- and the exam pipeline (start/answer/submit/result) gets zero traffic.
--
-- Prerequisites (run first in this order):
--   1. All supabase/migrations/*.sql files applied
--   2. supabase/migrations/20260715000001_add_tests_rls_policies.sql applied
--      (adds the SELECT/INSERT/UPDATE/DELETE policies for the tests table;
--       without these policies the INSERT below will be silently blocked by RLS)
--
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Idempotent: safe to re-run.
--   • Existing published test  → skipped (no duplicate)
--   • Existing draft test      → promoted to published
--   • Questions already exist  → skipped via ON CONFLICT DO NOTHING
-- ============================================================

DO $$
DECLARE
  v_institution_id UUID;
  v_creator_id     UUID;
  v_test_id        UUID;
  v_existing_status TEXT;
BEGIN

  -- ── Verify RLS policies exist before trying to insert ─────
  -- If this check fails the INSERT will silently return 0 rows due to RLS.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tests' AND policyname = 'tests_admin_insert'
  ) THEN
    RAISE EXCEPTION
      'MISSING RLS POLICY: tests_admin_insert not found. '
      'Apply supabase/migrations/20260715000001_add_tests_rls_policies.sql first, '
      'then re-run this seed.';
  END IF;

  -- ── Find the institution via the test student account ─────
  SELECT institution_id INTO v_institution_id
  FROM public.profiles
  WHERE email = 'student@college.edu'
  LIMIT 1;

  IF v_institution_id IS NULL THEN
    RAISE EXCEPTION
      'Cannot seed: no profile found for student@college.edu. '
      'Ensure the user exists in auth.users and has a corresponding profiles row.';
  END IF;

  RAISE NOTICE 'institution_id: %', v_institution_id;

  -- ── Find a creator (admin/faculty preferred, student fallback) ─
  SELECT id INTO v_creator_id
  FROM public.profiles
  WHERE institution_id = v_institution_id
    AND role IN ('admin', 'faculty')
  ORDER BY
    CASE role WHEN 'admin' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_creator_id IS NULL THEN
    SELECT id INTO v_creator_id
    FROM public.profiles
    WHERE email = 'student@college.edu'
    LIMIT 1;
  END IF;

  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION
      'Cannot seed: no admin, faculty, or student profile found for institution %.', v_institution_id;
  END IF;

  RAISE NOTICE 'creator_id: %', v_creator_id;

  -- ── Check if test already exists ──────────────────────────
  SELECT id, status INTO v_test_id, v_existing_status
  FROM public.tests
  WHERE title = 'Load Test Exam — MCQ Practice'
    AND institution_id = v_institution_id
  LIMIT 1;

  IF v_test_id IS NOT NULL THEN
    IF v_existing_status = 'published' THEN
      RAISE NOTICE 'Test already published (id: %) — skipping.', v_test_id;
    ELSE
      -- Promote draft → published so k6 can find it
      UPDATE public.tests
      SET status = 'published'
      WHERE id = v_test_id;
      RAISE NOTICE 'Test promoted to published (id: %, was: %).', v_test_id, v_existing_status;
    END IF;
  ELSE
    -- ── Insert the test ──────────────────────────────────────
    INSERT INTO public.tests (
      title,
      type,
      status,
      duration_mins,
      institution_id,
      created_by,
      batch_id    -- NULL = visible to ALL students in the institution
    ) VALUES (
      'Load Test Exam — MCQ Practice',
      'aptitude',
      'published',
      30,
      v_institution_id,
      v_creator_id,
      NULL
    )
    RETURNING id INTO v_test_id;

    IF v_test_id IS NULL THEN
      RAISE EXCEPTION
        'INSERT INTO tests returned no id — likely blocked by an RLS policy. '
        'Verify that supabase/migrations/20260715000001_add_tests_rls_policies.sql was applied '
        'and that auth.uid() resolves to a profile with role admin/faculty/super-admin.';
    END IF;

    RAISE NOTICE 'Created test id: %', v_test_id;
  END IF;

  -- ── Insert 5 MCQ questions (skip if already present) ─────
  INSERT INTO public.test_questions
    (test_id, question, type, options, correct_answer, marks, order_index)
  VALUES
    (
      v_test_id,
      'What does HTTP stand for?',
      'mcq',
      '["HyperText Transfer Protocol","High Transfer Text Protocol","Hyperlink Text Protocol","HyperText Template Protocol"]',
      'HyperText Transfer Protocol',
      2, 1
    ),
    (
      v_test_id,
      'Which data structure follows Last-In-First-Out (LIFO) ordering?',
      'mcq',
      '["Queue","Stack","Linked List","Binary Tree"]',
      'Stack',
      2, 2
    ),
    (
      v_test_id,
      'What is the time complexity of binary search on a sorted array?',
      'mcq',
      '["O(n)","O(n²)","O(log n)","O(1)"]',
      'O(log n)',
      2, 3
    ),
    (
      v_test_id,
      'Which SQL keyword retrieves only unique values from a column?',
      'mcq',
      '["UNIQUE","DISTINCT","ONLY","FILTER"]',
      'DISTINCT',
      2, 4
    ),
    (
      v_test_id,
      'In REST APIs, which HTTP method is used to update an existing resource?',
      'mcq',
      '["GET","POST","PUT","DELETE"]',
      'PUT',
      2, 5
    )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Questions seeded for test %', v_test_id;

END $$;

-- ── Verification query — run this to confirm success ──────────
-- Expected: 1 row with status='published' and question_count=5
SELECT
  t.id,
  t.title,
  t.status,
  t.type,
  t.duration_mins,
  t.institution_id,
  COUNT(q.id) AS question_count
FROM public.tests t
LEFT JOIN public.test_questions q ON q.test_id = t.id
WHERE t.title = 'Load Test Exam — MCQ Practice'
GROUP BY t.id, t.title, t.status, t.type, t.duration_mins, t.institution_id;
