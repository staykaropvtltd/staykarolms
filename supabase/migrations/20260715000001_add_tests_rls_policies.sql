-- Add missing RLS policies for the tests table.
-- The initial schema enabled RLS on tests but never defined any policies,
-- so every SELECT/INSERT/UPDATE/DELETE was silently denied for non-superusers.

drop policy if exists "tests_institution_select" on public.tests;
create policy "tests_institution_select" on public.tests
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'super-admin' or p.institution_id = tests.institution_id)
    )
  );

drop policy if exists "tests_admin_insert" on public.tests;
create policy "tests_admin_insert" on public.tests
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'faculty', 'super-admin')
        and (p.role = 'super-admin' or p.institution_id = tests.institution_id)
    )
  );

drop policy if exists "tests_admin_update" on public.tests;
create policy "tests_admin_update" on public.tests
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'faculty', 'super-admin')
        and (p.role = 'super-admin' or p.institution_id = tests.institution_id)
    )
  );

drop policy if exists "tests_admin_delete" on public.tests;
create policy "tests_admin_delete" on public.tests
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super-admin')
        and (p.role = 'super-admin' or p.institution_id = tests.institution_id)
    )
  );
