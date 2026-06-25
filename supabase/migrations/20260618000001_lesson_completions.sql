-- Migration: Create lesson_completions table

CREATE TABLE IF NOT EXISTS lesson_completions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  content_id UUID REFERENCES course_content(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, content_id)
);

-- Enable RLS
ALTER TABLE lesson_completions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Students can view their own completions" ON lesson_completions
  FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "Admins and faculty can view all completions" ON lesson_completions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'faculty', 'super-admin')
    )
  );

-- Backend handles inserts, so we don't strictly need an INSERT policy for students here if we use service role or if we rely on the backend API. 
-- However, since the backend uses the user's token (Row Level Security applies), we need an INSERT policy:
CREATE POLICY "Students can insert their own completions" ON lesson_completions
  FOR INSERT WITH CHECK (auth.uid() = student_id);
