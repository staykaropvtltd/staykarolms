# Pending Manual Actions

## 1. Run DB Migration — AI Interview Questions Table
**Where:** Supabase Dashboard → SQL Editor → New query

```sql
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

ALTER TABLE ai_interview_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read their institution questions"
  ON ai_interview_questions FOR SELECT
  TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
    OR institution_id IS NULL
  );
```

**Why:** Without this table, the AI Interviewer page returns a 400 error and
admins cannot add/import questions.

---

## 2. Fix Orphaned User Accounts
**Where:** Supabase Dashboard → SQL Editor

Two users exist in Supabase Auth but have no row in the `profiles` table.
This causes 404 errors on the admin Students / Faculty pages.

**Step 1 — Identify:**
```sql
SELECT id, email FROM auth.users
WHERE id IN (
  '120ef4d1-5544-432f-b989-69276efa44ea',
  'a1c9cbd6-3fee-4974-8679-a6651eef9abd'
);
```

**Step 2 — Fix (choose one):**

Option A — Delete if they are old test accounts:
Go to Supabase Dashboard → Authentication → Users, search by the UUIDs above,
and delete them.

Option B — Create missing profile rows if they are real users:
```sql
INSERT INTO profiles (id, name, email, role, institution_id)
VALUES
  ('120ef4d1-5544-432f-b989-69276efa44ea', 'Name Here', 'email@here.com', 'student', '<institution_id>'),
  ('a1c9cbd6-3fee-4974-8679-a6651eef9abd', 'Name Here', 'email@here.com', 'student', '<institution_id>');
```

---

## Status

| Action | Done? |
|--------|-------|
| Run AI interview questions migration | [ ] |
| Fix orphaned user accounts | [ ] |
