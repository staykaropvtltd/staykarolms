-- batch_courses: links a batch to a course so all batch students get enrolled
create table if not exists batch_courses (
  id           uuid default uuid_generate_v4() primary key,
  batch_id     uuid references batches(id) on delete cascade not null,
  course_id    uuid references courses(id) on delete cascade not null,
  assigned_at  timestamptz default now(),
  unique(batch_id, course_id)
);

alter table batch_courses enable row level security;

-- Admins and faculty can read/write batch_courses for their institution
create policy "Institution members can read batch_courses"
  on batch_courses for select
  using (
    batch_id in (
      select id from batches where institution_id = (
        select institution_id from profiles where id = auth.uid()
      )
    )
  );

create policy "Admins can manage batch_courses"
  on batch_courses for all
  using (
    batch_id in (
      select id from batches where institution_id = (
        select institution_id from profiles where id = auth.uid()
      )
    )
  );
