-- Add roll_number to student profiles for leaderboard identification.
-- Existing rows will be NULL; admins populate via the student management UI.
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS roll_number text;

-- Partial index keeps lookups fast while not wasting space on NULL rows.
CREATE INDEX IF NOT EXISTS idx_profiles_roll_number
  ON profiles (roll_number)
  WHERE roll_number IS NOT NULL;
