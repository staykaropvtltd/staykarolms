-- ============================================================
-- Add Course Modules and Enrollment logic
-- ============================================================

-- Create course_modules table
create table if not exists course_modules (
  id uuid default uuid_generate_v4() primary key,
  course_id uuid references courses(id) on delete cascade,
  title text not null,
  order_index int default 0,
  created_at timestamptz default now()
);

-- Add module_id to course_content
alter table course_content
add column if not exists module_id uuid references course_modules(id) on delete set null;

-- Enable RLS on course_modules
alter table course_modules enable row level security;

create policy "course_modules: anyone authenticated can read"
  on course_modules for select using (auth.uid() is not null);

create policy "course_modules: admin/faculty can modify"
  on course_modules for all using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'faculty', 'super-admin')
    )
  );

-- Update RLS for course_content if it was lost
create policy "course_content_mod: admin/faculty can modify"
  on course_content for all using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'faculty', 'super-admin')
    )
  );
