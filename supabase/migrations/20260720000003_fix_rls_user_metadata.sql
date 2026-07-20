-- Fix: Replace all RLS policies that reference auth.jwt() -> 'user_metadata'
-- with a SECURITY DEFINER function that reads from the server-controlled profiles table.
-- user_metadata is editable by end users and must never be used in security contexts.

-- Helper function: returns the current user's role from profiles (not user_metadata).
-- SECURITY DEFINER + search_path lock prevents privilege escalation.
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ── profiles ────────────────────────────────────────────────────────────────
drop policy if exists "Admins can view all profiles" on profiles;
create policy "Admins can view all profiles"
  on profiles for select
  using (public.get_my_role() in ('admin', 'super-admin', 'faculty'));

-- ── courses ─────────────────────────────────────────────────────────────────
drop policy if exists "Students see enrolled courses" on courses;
create policy "Students see enrolled courses"
  on courses for select
  using (
    id in (select course_id from enrollments where student_id = auth.uid())
    or public.get_my_role() in ('admin', 'faculty', 'super-admin')
  );

-- ── course_content ───────────────────────────────────────────────────────────
drop policy if exists "Faculty and admin can manage course content" on course_content;
create policy "Faculty and admin can manage course content"
  on course_content for all
  using (public.get_my_role() in ('admin', 'faculty', 'super-admin'));

-- ── live_classes ─────────────────────────────────────────────────────────────
drop policy if exists "Faculty and admin can manage live classes" on live_classes;
create policy "Faculty and admin can manage live classes"
  on live_classes for all
  using (public.get_my_role() in ('admin', 'faculty', 'super-admin'));

-- ── live_class_attendance ────────────────────────────────────────────────────
drop policy if exists "Users can view attendance" on live_class_attendance;
create policy "Users can view attendance"
  on live_class_attendance for select
  using (
    auth.uid() = student_id
    or public.get_my_role() in ('admin', 'faculty', 'super-admin')
  );

-- ── calendar_events ───────────────────────────────────────────────────────────
drop policy if exists "Faculty and admin can manage calendar events" on calendar_events;
create policy "Faculty and admin can manage calendar events"
  on calendar_events for all
  using (public.get_my_role() in ('admin', 'faculty', 'super-admin'));

-- ── audit_logs ────────────────────────────────────────────────────────────────
drop policy if exists "Super admin can view audit logs" on audit_logs;
create policy "Super admin can view audit logs"
  on audit_logs for select
  using (public.get_my_role() = 'super-admin');

-- ── support_tickets ───────────────────────────────────────────────────────────
drop policy if exists "Admin and super-admin can view support tickets" on support_tickets;
create policy "Admin and super-admin can view support tickets"
  on support_tickets for select
  using (public.get_my_role() in ('admin', 'super-admin'));

drop policy if exists "Admins can create support tickets" on support_tickets;
create policy "Admins can create support tickets"
  on support_tickets for insert
  with check (public.get_my_role() in ('admin', 'super-admin'));

-- ── support_ticket_messages ───────────────────────────────────────────────────
drop policy if exists "View ticket messages" on support_ticket_messages;
create policy "View ticket messages"
  on support_ticket_messages for select
  using (public.get_my_role() in ('admin', 'super-admin'));

drop policy if exists "Insert ticket messages" on support_ticket_messages;
create policy "Insert ticket messages"
  on support_ticket_messages for insert
  with check (public.get_my_role() in ('admin', 'super-admin'));

-- ── institutions ──────────────────────────────────────────────────────────────
drop policy if exists "Super admin can manage institutions" on institutions;
create policy "Super admin can manage institutions"
  on institutions for all
  using (public.get_my_role() = 'super-admin');
