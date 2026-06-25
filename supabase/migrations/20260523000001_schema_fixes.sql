-- ============================================================
-- StayKaro LMS — Schema Fixes & New Tables
-- Run in Supabase SQL editor after the initial migration
-- ============================================================

-- ── Course Content ─────────────────────────────────────────────
create table if not exists course_content (
  id uuid default uuid_generate_v4() primary key,
  course_id uuid references courses(id) on delete cascade,
  title text not null,
  type text check (type in ('video','pdf','quiz','code','reading')) not null,
  url text,
  description text,
  duration_mins int,
  order_index int default 0,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- ── Live Classes ───────────────────────────────────────────────
create table if not exists live_classes (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  course_id uuid references courses(id),
  institution_id uuid references institutions(id),
  created_by uuid references profiles(id),
  scheduled_at timestamptz not null,
  duration_mins int default 60,
  platform text check (platform in ('zoom','google_meet','ms_teams','platform')) default 'platform',
  meeting_link text,
  meeting_id text,
  status text check (status in ('upcoming','live','completed','cancelled')) default 'upcoming',
  description text,
  created_at timestamptz default now()
);

-- ── Live Class Attendance (popup based) ────────────────────────
create table if not exists live_class_attendance (
  id uuid default uuid_generate_v4() primary key,
  live_class_id uuid references live_classes(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  status text check (status in ('present','absent')) default 'present',
  responded_at timestamptz default now(),
  unique(live_class_id, student_id)
);

-- ── Messages ───────────────────────────────────────────────────
create table if not exists messages (
  id uuid default uuid_generate_v4() primary key,
  sender_id uuid references profiles(id) on delete cascade,
  receiver_id uuid references profiles(id) on delete cascade,
  content text not null,
  read boolean default false,
  created_at timestamptz default now()
);

-- ── Calendar Events ────────────────────────────────────────────
create table if not exists calendar_events (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  type text check (type in ('live','doubt','workshop','exam','holiday','assignment')) default 'live',
  course_id uuid references courses(id),
  institution_id uuid references institutions(id),
  created_by uuid references profiles(id),
  scheduled_at timestamptz not null,
  end_at timestamptz,
  duration_mins int,
  description text,
  created_at timestamptz default now()
);

-- ── Audit Logs (super-admin) ───────────────────────────────────
create table if not exists audit_logs (
  id uuid default uuid_generate_v4() primary key,
  actor_id uuid references profiles(id),
  actor_email text,
  actor_role text,
  action text not null,
  resource text,
  resource_id text,
  severity text check (severity in ('info','warning','critical')) default 'info',
  ip_address text,
  status text check (status in ('success','failed')) default 'success',
  metadata jsonb,
  created_at timestamptz default now()
);

-- ── Support Tickets (super-admin) ──────────────────────────────
create table if not exists support_tickets (
  id uuid default uuid_generate_v4() primary key,
  subject text not null,
  institution_id uuid references institutions(id),
  raised_by uuid references profiles(id),
  priority text check (priority in ('low','medium','high','critical')) default 'medium',
  status text check (status in ('open','in_progress','resolved','closed')) default 'open',
  category text check (category in ('billing','technical','account','feature_request')) default 'technical',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists support_ticket_messages (
  id uuid default uuid_generate_v4() primary key,
  ticket_id uuid references support_tickets(id) on delete cascade,
  sender_id uuid references profiles(id),
  content text not null,
  is_staff boolean default false,
  created_at timestamptz default now()
);

-- ── Fix batches table — add missing columns ────────────────────
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'batches' and column_name = 'mentor_id'
  ) then
    alter table batches add column mentor_id uuid references profiles(id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'batches' and column_name = 'description'
  ) then
    alter table batches add column description text;
  end if;
end $$;

-- ── Add missing unique constraints ─────────────────────────────
-- attendance upsert requires this
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'attendance_student_course_date_unique'
  ) then
    alter table attendance add constraint attendance_student_course_date_unique
      unique (student_id, course_id, date);
  end if;
end $$;

-- test_answers upsert requires this
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'test_answers_attempt_question_unique'
  ) then
    alter table test_answers add constraint test_answers_attempt_question_unique
      unique (attempt_id, question_id);
  end if;
end $$;

-- ============================================================
-- Row Level Security for new tables
-- ============================================================

alter table course_content enable row level security;
alter table live_classes enable row level security;
alter table live_class_attendance enable row level security;
alter table messages enable row level security;
alter table calendar_events enable row level security;
alter table audit_logs enable row level security;
alter table support_tickets enable row level security;
alter table support_ticket_messages enable row level security;

-- course_content: anyone authenticated can read, faculty/admin can write
create policy "Authenticated users can view course content"
  on course_content for select using (auth.uid() is not null);

create policy "Faculty and admin can manage course content"
  on course_content for all using (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'faculty', 'super-admin')
  );

-- live_classes: anyone authenticated can read, faculty/admin can write
create policy "Authenticated users can view live classes"
  on live_classes for select using (auth.uid() is not null);

create policy "Faculty and admin can manage live classes"
  on live_classes for all using (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'faculty', 'super-admin')
  );

-- live_class_attendance: students can insert their own, faculty/admin can read all
create policy "Students can mark own attendance"
  on live_class_attendance for insert with check (auth.uid() = student_id);

create policy "Users can view attendance"
  on live_class_attendance for select using (
    auth.uid() = student_id or
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'faculty', 'super-admin')
  );

-- messages: users see their own messages
create policy "Users see own messages"
  on messages for select using (
    auth.uid() = sender_id or auth.uid() = receiver_id
  );

create policy "Users can send messages"
  on messages for insert with check (auth.uid() = sender_id);

create policy "Users can update own messages"
  on messages for update using (auth.uid() = receiver_id);

-- calendar_events: authenticated users can read
create policy "Authenticated users can view calendar events"
  on calendar_events for select using (auth.uid() is not null);

create policy "Faculty and admin can manage calendar events"
  on calendar_events for all using (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'faculty', 'super-admin')
  );

-- audit_logs: super-admin only
create policy "Super admin can view audit logs"
  on audit_logs for select using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'super-admin'
  );

create policy "System can insert audit logs"
  on audit_logs for insert with check (true);

-- support_tickets: admin and super-admin
create policy "Admin and super-admin can view support tickets"
  on support_tickets for select using (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'super-admin')
  );

create policy "Admins can create support tickets"
  on support_tickets for insert with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'super-admin')
  );

create policy "View ticket messages"
  on support_ticket_messages for select using (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'super-admin')
  );

create policy "Insert ticket messages"
  on support_ticket_messages for insert with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'super-admin')
  );

-- institutions: enable RLS and allow reading
alter table institutions enable row level security;

create policy "Authenticated users can view institutions"
  on institutions for select using (auth.uid() is not null);

create policy "Super admin can manage institutions"
  on institutions for all using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'super-admin'
  );

-- ── Service role bypass for backend ────────────────────────────
-- The backend uses the service_role key which bypasses RLS automatically
-- These policies only apply to direct client-side access
