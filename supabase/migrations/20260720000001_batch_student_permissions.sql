-- Per-batch student sidebar access control.
-- NULL means no restrictions (all items visible).
-- A non-null array lists the exact sidebar path keys the student can see.

ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS student_permissions TEXT[] DEFAULT NULL;
