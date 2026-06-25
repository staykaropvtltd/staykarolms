-- ============================================================
-- Add batch targeting and realtime to Live Classes
-- ============================================================

-- Add batch_id to live_classes to target specific batches
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'live_classes' and column_name = 'batch_id'
  ) then
    alter table live_classes add column batch_id uuid references batches(id) on delete cascade;
  end if;
end $$;

-- Explicitly add the necessary tables to the realtime publication
-- This ensures the frontend subscriptions (postgres_changes) trigger properly
alter publication supabase_realtime add table live_classes;
alter publication supabase_realtime add table live_class_attendance;
