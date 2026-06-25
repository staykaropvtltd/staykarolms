-- ============================================================
-- StayKaro LMS — Initial Schema
-- Run via Supabase GitHub integration or SQL editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles (extends Supabase auth.users)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  email text not null,
  role text check (role in ('super-admin','admin','faculty','student')) not null,
  institution_id uuid,
  avatar_url text,
  created_at timestamptz default now()
);

-- Institutions
create table if not exists institutions (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  logo_url text,
  plan text default 'basic',
  created_at timestamptz default now()
);

-- Courses
create table if not exists courses (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  institution_id uuid references institutions(id),
  faculty_id uuid references profiles(id),
  thumbnail_url text,
  status text default 'active',
  created_at timestamptz default now()
);

-- Course enrollments
create table if not exists enrollments (
  id uuid default uuid_generate_v4() primary key,
  course_id uuid references courses(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  progress int default 0,
  enrolled_at timestamptz default now(),
  unique(course_id, student_id)
);

-- Batches
create table if not exists batches (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  institution_id uuid references institutions(id),
  course_id uuid references courses(id),
  start_date date,
  end_date date,
  created_at timestamptz default now()
);

create table if not exists batch_students (
  batch_id uuid references batches(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  primary key (batch_id, student_id)
);

-- Tests
create table if not exists tests (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  type text check (type in ('coding','aptitude','mock')) not null,
  institution_id uuid references institutions(id),
  created_by uuid references profiles(id),
  batch_id uuid references batches(id),
  duration_mins int not null,
  scheduled_at timestamptz,
  status text default 'draft',
  created_at timestamptz default now()
);

create table if not exists test_questions (
  id uuid default uuid_generate_v4() primary key,
  test_id uuid references tests(id) on delete cascade,
  question text not null,
  type text check (type in ('mcq','coding','short')) not null,
  options jsonb,
  correct_answer text,
  marks int default 1,
  order_index int default 0
);

create table if not exists test_attempts (
  id uuid default uuid_generate_v4() primary key,
  test_id uuid references tests(id),
  student_id uuid references profiles(id),
  started_at timestamptz default now(),
  submitted_at timestamptz,
  score int,
  status text default 'in_progress'
);

create table if not exists test_answers (
  id uuid default uuid_generate_v4() primary key,
  attempt_id uuid references test_attempts(id) on delete cascade,
  question_id uuid references test_questions(id),
  answer text,
  is_correct boolean,
  marks_awarded int default 0
);

-- Assignments
create table if not exists assignments (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  course_id uuid references courses(id),
  created_by uuid references profiles(id),
  due_date timestamptz,
  max_marks int default 100,
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists assignment_submissions (
  id uuid default uuid_generate_v4() primary key,
  assignment_id uuid references assignments(id),
  student_id uuid references profiles(id),
  file_url text,
  submitted_at timestamptz default now(),
  grade int,
  feedback text,
  graded_by uuid references profiles(id),
  unique(assignment_id, student_id)
);

-- Attendance
create table if not exists attendance (
  id uuid default uuid_generate_v4() primary key,
  student_id uuid references profiles(id),
  course_id uuid references courses(id),
  date date not null,
  status text check (status in ('present','absent','late')) default 'present'
);

-- Notifications
create table if not exists notifications (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text check (type in ('success','info','warning','error')) default 'info',
  category text check (category in ('system','academic','assignment','certificate')) default 'system',
  read boolean default false,
  created_at timestamptz default now()
);

-- AI Sessions
create table if not exists ai_sessions (
  id uuid default uuid_generate_v4() primary key,
  student_id uuid references profiles(id),
  track text not null,
  difficulty text not null,
  duration_mins int,
  score int,
  feedback text,
  questions jsonb,
  created_at timestamptz default now()
);

-- Certificates
create table if not exists certificates (
  id uuid default uuid_generate_v4() primary key,
  student_id uuid references profiles(id),
  course_id uuid references courses(id),
  issued_at timestamptz default now(),
  file_url text,
  verification_code text unique default encode(gen_random_bytes(8), 'hex')
);

-- Billing
create table if not exists billing (
  id uuid default uuid_generate_v4() primary key,
  institution_id uuid references institutions(id),
  plan text not null,
  amount numeric not null,
  status text default 'paid',
  paid_at timestamptz default now(),
  invoice_url text
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table profiles enable row level security;
alter table courses enable row level security;
alter table enrollments enable row level security;
alter table tests enable row level security;
alter table test_attempts enable row level security;
alter table test_answers enable row level security;
alter table assignments enable row level security;
alter table assignment_submissions enable row level security;
alter table notifications enable row level security;
alter table ai_sessions enable row level security;

-- Basic RLS policies
drop policy if exists "Users see own profile" on profiles;
create policy "Users see own profile"
  on profiles for select using (auth.uid() = id);

drop policy if exists "Admins can view all profiles" on profiles;
create policy "Admins can view all profiles"
  on profiles for select
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'super-admin', 'faculty')
  );

drop policy if exists "Students see own attempts" on test_attempts;
create policy "Students see own attempts"
  on test_attempts for select using (auth.uid() = student_id);

drop policy if exists "Students see own answers" on test_answers;
create policy "Students see own answers"
  on test_answers for select
  using (attempt_id in (
    select id from test_attempts where student_id = auth.uid()
  ));

drop policy if exists "Students see own notifications" on notifications;
create policy "Students see own notifications"
  on notifications for select using (auth.uid() = user_id);

drop policy if exists "Students see own submissions" on assignment_submissions;
create policy "Students see own submissions"
  on assignment_submissions for select using (auth.uid() = student_id);

drop policy if exists "Students see enrolled courses" on courses;
create policy "Students see enrolled courses"
  on courses for select
  using (
    id in (select course_id from enrollments where student_id = auth.uid())
    or (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'faculty', 'super-admin')
  );


-- Auto-create profile on signup trigger
create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'student')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
