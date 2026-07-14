-- ============================================================
-- StayKaro LMS — Fix Orphaned Admin Profiles
--
-- admin@college.edu and superadmin@staykaro.com exist in
-- Supabase Auth (auth.users) but have no rows in public.profiles.
-- This causes 401 "User profile not found" on every request.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to re-run: ON CONFLICT (id) DO NOTHING guards each INSERT.
-- ============================================================

DO $$
DECLARE
  v_institution_id    UUID;
  v_admin_auth_id     UUID;
  v_superadmin_auth_id UUID;
  v_faculty_auth_id   UUID;
BEGIN

  -- ── Discover the institution used by the test student ─────
  SELECT institution_id INTO v_institution_id
  FROM public.profiles
  WHERE email = 'student@college.edu'
  LIMIT 1;

  IF v_institution_id IS NULL THEN
    RAISE NOTICE 'student@college.edu profile not found — using first available institution';
    SELECT id INTO v_institution_id FROM public.institutions LIMIT 1;
  END IF;

  RAISE NOTICE 'Using institution_id: %', v_institution_id;

  -- ── Fix admin@college.edu ─────────────────────────────────
  SELECT id INTO v_admin_auth_id
  FROM auth.users
  WHERE email = 'admin@college.edu'
  LIMIT 1;

  IF v_admin_auth_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, name, role, institution_id)
    VALUES (v_admin_auth_id, 'admin@college.edu', 'College Admin', 'admin', v_institution_id)
    ON CONFLICT (id) DO UPDATE
      SET role = 'admin',
          institution_id = EXCLUDED.institution_id
      WHERE public.profiles.role IS NULL OR public.profiles.institution_id IS NULL;
    RAISE NOTICE 'admin@college.edu profile ensured (id: %)', v_admin_auth_id;
  ELSE
    RAISE NOTICE 'admin@college.edu not found in auth.users — skipping';
  END IF;

  -- ── Fix superadmin@staykaro.com ───────────────────────────
  SELECT id INTO v_superadmin_auth_id
  FROM auth.users
  WHERE email = 'superadmin@staykaro.com'
  LIMIT 1;

  IF v_superadmin_auth_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, name, role, institution_id)
    VALUES (v_superadmin_auth_id, 'superadmin@staykaro.com', 'StayKaro Super Admin', 'super-admin', NULL)
    ON CONFLICT (id) DO UPDATE
      SET role = 'super-admin'
      WHERE public.profiles.role IS NULL;
    RAISE NOTICE 'superadmin@staykaro.com profile ensured (id: %)', v_superadmin_auth_id;
  ELSE
    RAISE NOTICE 'superadmin@staykaro.com not found in auth.users — skipping';
  END IF;

  -- ── Ensure a faculty account exists for creating tests ────
  SELECT id INTO v_faculty_auth_id
  FROM auth.users
  WHERE email = 'faculty@college.edu'
  LIMIT 1;

  IF v_faculty_auth_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, name, role, institution_id)
    VALUES (v_faculty_auth_id, 'faculty@college.edu', 'Test Faculty', 'faculty', v_institution_id)
    ON CONFLICT (id) DO NOTHING;
    RAISE NOTICE 'faculty@college.edu profile ensured';
  END IF;

END $$;

-- ── Verify ────────────────────────────────────────────────────
SELECT id, email, role, institution_id
FROM public.profiles
WHERE email IN (
  'student@college.edu',
  'admin@college.edu',
  'superadmin@staykaro.com',
  'faculty@college.edu'
)
ORDER BY role;
