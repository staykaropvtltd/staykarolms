-- ============================================================
-- StayKaro LMS — Exam Seed Data
--
-- Creates one published MCQ test with 5 questions, visible to
-- all students in the same institution as student@college.edu.
-- This unblocks the k6 exam load test — without a published
-- test, VUs can only test the dashboard + tests-list endpoints
-- and the exam pipeline (start/answer/submit/result) gets zero traffic.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to re-run: existence checks guard every INSERT.
-- ============================================================

DO $$
DECLARE
  v_institution_id UUID;
  v_creator_id     UUID;
  v_test_id        UUID;
BEGIN

  -- ── Find the institution ──────────────────────────────────
  SELECT institution_id INTO v_institution_id
  FROM public.profiles
  WHERE email = 'student@college.edu'
  LIMIT 1;

  IF v_institution_id IS NULL THEN
    RAISE EXCEPTION 'Cannot seed: no profile found for student@college.edu. Run fix_admin_profiles.sql first and ensure student@college.edu has a profile.';
  END IF;

  RAISE NOTICE 'Seeding for institution_id: %', v_institution_id;

  -- ── Find a creator (admin, faculty, or student fallback) ─
  SELECT id INTO v_creator_id
  FROM public.profiles
  WHERE institution_id = v_institution_id
    AND role IN ('admin', 'faculty')
  ORDER BY role  -- prefer admin over faculty
  LIMIT 1;

  IF v_creator_id IS NULL THEN
    -- Fallback: use the student — Supabase allows this at the DB level
    SELECT id INTO v_creator_id
    FROM public.profiles
    WHERE email = 'student@college.edu'
    LIMIT 1;
  END IF;

  RAISE NOTICE 'Using creator_id: %', v_creator_id;

  -- ── Skip if test already exists ───────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.tests
    WHERE title = 'Load Test Exam — MCQ Practice'
      AND institution_id = v_institution_id
      AND status = 'published'
  ) THEN
    RAISE NOTICE 'Published test already exists — skipping insert';
    RETURN;
  END IF;

  -- ── Insert the test ───────────────────────────────────────
  INSERT INTO public.tests (
    title,
    type,
    status,
    duration_mins,
    institution_id,
    created_by,
    batch_id        -- NULL = visible to ALL students in the institution
  ) VALUES (
    'Load Test Exam — MCQ Practice',
    'mock',
    'published',
    30,
    v_institution_id,
    v_creator_id,
    NULL
  )
  RETURNING id INTO v_test_id;

  RAISE NOTICE 'Created test id: %', v_test_id;

  -- ── Insert 5 MCQ questions ────────────────────────────────
  -- options must be a JSON array of strings (matched by the frontend)
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
    );

  RAISE NOTICE 'Inserted 5 MCQ questions for test %', v_test_id;

END $$;

-- ── Verify ────────────────────────────────────────────────────
SELECT
  t.id,
  t.title,
  t.status,
  t.duration_mins,
  t.institution_id,
  COUNT(q.id) AS question_count
FROM public.tests t
LEFT JOIN public.test_questions q ON q.test_id = t.id
WHERE t.title = 'Load Test Exam — MCQ Practice'
GROUP BY t.id, t.title, t.status, t.duration_mins, t.institution_id;
