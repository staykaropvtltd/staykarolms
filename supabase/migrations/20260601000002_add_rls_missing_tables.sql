-- Enable RLS on the 6 tables that were missing policies.
-- Without this, the leaked anon key grants read access to all rows.

-- ── attendance ────────────────────────────────────────────────────────────────
alter table public.attendance enable row level security;

create policy "attendance_institution_isolation" on public.attendance
  using (
    exists (
      select 1 from public.profiles p
      join public.courses c on c.id = attendance.course_id
      where p.id = auth.uid()
        and (p.role = 'super-admin' or p.institution_id = c.institution_id)
    )
  );

-- ── batch_students ────────────────────────────────────────────────────────────
alter table public.batch_students enable row level security;

create policy "batch_students_institution_isolation" on public.batch_students
  using (
    auth.uid() = batch_students.student_id
    or exists (
      select 1 from public.profiles p
      join public.batches b on b.id = batch_students.batch_id
      where p.id = auth.uid()
        and (p.role = 'super-admin' or p.institution_id = b.institution_id)
    )
  );

-- ── batches ───────────────────────────────────────────────────────────────────
alter table public.batches enable row level security;

create policy "batches_institution_isolation" on public.batches
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'super-admin' or p.institution_id = batches.institution_id)
    )
  );

-- ── billing ───────────────────────────────────────────────────────────────────
alter table public.billing enable row level security;

create policy "billing_institution_isolation" on public.billing
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role in ('super-admin', 'admin') or p.institution_id = billing.institution_id)
    )
  );

-- ── certificates ─────────────────────────────────────────────────────────────
alter table public.certificates enable row level security;

create policy "certificates_own_and_institution" on public.certificates
  using (
    auth.uid() = certificates.student_id
    or exists (
      select 1 from public.profiles p
      join public.courses c on c.id = certificates.course_id
      where p.id = auth.uid()
        and (p.role = 'super-admin' or p.institution_id = c.institution_id)
    )
  );

-- ── test_questions ────────────────────────────────────────────────────────────
alter table public.test_questions enable row level security;

create policy "test_questions_institution_isolation" on public.test_questions
  using (
    exists (
      select 1 from public.profiles p
      join public.tests t on t.id = test_questions.test_id
      where p.id = auth.uid()
        and (p.role = 'super-admin' or p.institution_id = t.institution_id)
        and (p.role != 'student' or t.status = 'published')
    )
  );
