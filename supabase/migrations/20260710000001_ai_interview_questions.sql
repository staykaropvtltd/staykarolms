CREATE TABLE IF NOT EXISTS ai_interview_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  created_by uuid REFERENCES profiles(id),
  question text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  difficulty text NOT NULL DEFAULT 'Medium',
  track text NOT NULL DEFAULT 'general',
  answer_guide text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_interview_questions_institution_idx
  ON ai_interview_questions(institution_id);

CREATE INDEX IF NOT EXISTS ai_interview_questions_track_idx
  ON ai_interview_questions(track);

ALTER TABLE ai_interview_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read their institution questions"
  ON ai_interview_questions FOR SELECT
  TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR institution_id IS NULL
  );
