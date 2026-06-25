-- ============================================================
-- Add missing foreign key from profiles.institution_id to institutions.id
-- ============================================================

ALTER TABLE profiles
  ADD CONSTRAINT profiles_institution_id_fkey
  FOREIGN KEY (institution_id)
  REFERENCES institutions(id)
  ON DELETE SET NULL;
