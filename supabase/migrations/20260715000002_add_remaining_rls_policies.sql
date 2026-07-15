-- Add missing RLS policies for tables that have RLS enabled but zero policies.
-- Static audit (2026-07-15) found three such tables:
--   enrollments, assignments, ai_sessions
--
-- Without policies, these tables default-deny all access for non-superuser roles.
-- The backend uses the Supabase service role key which normally bypasses RLS,
-- but if "Force Row Level Security" is enabled at the project level all roles
-- are subject to these policies.

-- ── enrollments ───────────────────────────────────────────────
drop policy if exists "enrollments_student_own" on public.enrollments;
create policy "enrollments_student_own" on public.enrollments
  for select
  using (
    auth.uid() = student_id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'super-admin' or p.institution_id = (
          select institution_id from public.courses c where c.id = course_id
        ))
    )
  );

drop policy if exists "enrollments_admin_manage" on public.enrollments;
create policy "enrollments_admin_manage" on public.enrollments
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'faculty', 'super-admin')
    )
  );

-- ── assignments ───────────────────────────────────────────────
drop policy if exists "assignments_institution_select" on public.assignments;
create policy "assignments_institution_select" on public.assignments
  for select
  using (
    exists (
      select 1 from public.profiles p
      join public.courses c on c.id = assignments.course_id
      where p.id = auth.uid()
        and (p.role = 'super-admin' or p.institution_id = c.institution_id)
    )
  );

drop policy if exists "assignments_faculty_manage" on public.assignments;
create policy "assignments_faculty_manage" on public.assignments
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'faculty', 'super-admin')
    )
  );

-- ── ai_sessions ───────────────────────────────────────────────
drop policy if exists "ai_sessions_own" on public.ai_sessions;
create policy "ai_sessions_own" on public.ai_sessions
  for all
  using (
    auth.uid() = student_id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'faculty', 'super-admin')
    )
  );
