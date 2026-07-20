-- Track which faculty members are assigned to which batches.
-- Faculty can only see and act on batches they are explicitly assigned to.

create table if not exists batch_faculty (
  id           uuid default gen_random_uuid() primary key,
  batch_id     uuid not null references batches(id) on delete cascade,
  faculty_id   uuid not null references profiles(id) on delete cascade,
  assigned_at  timestamptz default now() not null,
  assigned_by  uuid references profiles(id),
  unique(batch_id, faculty_id)
);

alter table batch_faculty enable row level security;

-- Service role has unrestricted access (backend uses service key)
create policy "service_role_all" on batch_faculty
  for all to service_role using (true) with check (true);

-- Admins can view batch_faculty for their institution
create policy "admins_can_view" on batch_faculty
  for select using (
    exists (
      select 1 from profiles p
      join batches b on b.id = batch_faculty.batch_id
      where p.id = auth.uid()
        and p.role in ('admin', 'super-admin')
        and (p.role = 'super-admin' or p.institution_id = b.institution_id)
    )
  );

-- Faculty can see their own batch assignments
create policy "faculty_can_view_own" on batch_faculty
  for select using (faculty_id = auth.uid());

create index if not exists idx_batch_faculty_batch   on batch_faculty(batch_id);
create index if not exists idx_batch_faculty_faculty on batch_faculty(faculty_id);
