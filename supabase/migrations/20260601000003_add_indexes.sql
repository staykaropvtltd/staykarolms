-- Performance indexes — prevents full table scans on every query.
-- Without these, response times degrade linearly with data growth.

create index if not exists idx_notifications_user_id   on notifications(user_id, read, created_at desc);
create index if not exists idx_attendance_student       on attendance(student_id, course_id, date);
create index if not exists idx_test_attempts_student    on test_attempts(student_id, test_id);
create index if not exists idx_messages_pair            on messages(sender_id, receiver_id, created_at);
create index if not exists idx_enrollments_student      on enrollments(student_id);
create index if not exists idx_enrollments_course       on enrollments(course_id);
create index if not exists idx_profiles_institution     on profiles(institution_id, role);
create index if not exists idx_audit_logs_actor         on audit_logs(actor_id, created_at desc);
