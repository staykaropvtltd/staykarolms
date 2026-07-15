# Supabase Actions — Ordered Runbook

Run these actions **in the exact order listed** when you regain Supabase Dashboard access.

**Access method**: Supabase Dashboard → SQL Editor → New Query
**Project**: The project whose URL matches `VITE_SUPABASE_URL` / `SUPABASE_URL` in your `.env` files.

---

## Step 1 — Apply missing tests-table RLS policies

**File**: `supabase/migrations/20260715000001_add_tests_rls_policies.sql`

**Why**: The `tests` table has RLS enabled (from the initial schema) but zero policies were
ever defined for it. With Supabase's "Force Row Level Security" behaviour, this means every
SELECT/INSERT/UPDATE/DELETE is denied for all non-postgres roles — including the service role
when FRL is enabled. This is why `GET /api/tests` returns `[]` and `POST /api/tests` returns
`"new row violates row-level security policy"`.

Copy and paste the entire contents of `supabase/migrations/20260715000001_add_tests_rls_policies.sql`
into the SQL Editor and run it. Expected output: `Success. No rows returned.`

---

## Step 2 — Apply missing RLS policies for enrollments, assignments, ai_sessions

**File**: `supabase/migrations/20260715000002_add_remaining_rls_policies.sql`

**Why**: Static audit found three more tables with RLS enabled but no policies:
`enrollments`, `assignments`, `ai_sessions`. Without policies these tables default-deny all
access. Student dashboard analytics, assignment views, and AI interview history would return
empty even with correct authentication.

Copy and paste the entire contents of
`supabase/migrations/20260715000002_add_remaining_rls_policies.sql` into the SQL Editor
and run it.

---

## Step 3 — Seed the load-test exam

**File**: `backend/migrations/seed_exam_data.sql`

**Why**: The k6 exam scenario requires a published aptitude test with 5 MCQ questions visible
to `student@college.edu`. Without this the `setup()` function aborts immediately (the seed
now calls `fail()` instead of silently continuing with no exam).

**Prerequisites**: Steps 1 and 2 must be completed first. The seed script checks for the
`tests_admin_insert` policy and raises an exception if it is missing.

Copy and paste the entire contents of `backend/migrations/seed_exam_data.sql` into the
SQL Editor and run it.

**Verification**: The final `SELECT` in the seed should return exactly **1 row** with:
- `status = 'published'`
- `question_count = 5`

---

## Step 4 — Verify the student API sees the published test

Run this in the SQL Editor to confirm the test is visible:

```sql
-- Should return 1 row with status='published'
select id, title, status, type, duration_mins, institution_id
from public.tests
where title = 'Load Test Exam — MCQ Practice';

-- Should return 5 rows
select order_index, question, type
from public.test_questions
where test_id = (
  select id from public.tests where title = 'Load Test Exam — MCQ Practice' limit 1
)
order by order_index;
```

Then confirm via the live API (replace `$TOKEN` with a fresh student login token):

```bash
curl -s "https://staykarolmsbackend.vercel.app/api/tests?status=published" \
  -H "Authorization: Bearer $TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const r=JSON.parse(d);console.log('count:',r.data?.length)})"
```

Expected: `count: 1`

Once confirmed, inform the developer so k6 can be launched.

---

## Step 5 (Optional) — Set SUPABASE_JWT_SECRET in Vercel

**Location**: Vercel Dashboard → staykarolmsbackend → Settings → Environment Variables

**Variable**: `SUPABASE_JWT_SECRET`
**Value**: Supabase Dashboard → Settings → API → JWT Secret (the long HS256 secret, NOT the anon key)

**Why**: Without this, the auth middleware falls back to `supabase.auth.getUser(token)` on every
cache miss — one extra network round-trip (~200–400 ms) per cold request. With it, JWT
verification is local (zero network calls).

---

## Step 6 (Optional) — Set REDIS_URL in Vercel

**Location**: Vercel Dashboard → staykarolmsbackend → Settings → Environment Variables

**Variable**: `REDIS_URL`
**Value**: Your Redis provider's connection string (e.g. `redis://default:password@host:6379`)

**Why**: Enables distributed rate-limiting (shared across all Vercel serverless invocations)
and the profile/analytics/notification caches. Without Redis, each invocation enforces rate
limits independently (effective under normal load but less precise under burst).

---

## Notes

- All migration files use `drop policy if exists` + `create policy` patterns — safe to re-run.
- The seed (`seed_exam_data.sql`) is fully idempotent: re-running promotes an existing draft
  to published and skips question inserts via `ON CONFLICT DO NOTHING`.
- No UUIDs are hardcoded anywhere — everything is looked up dynamically via email/role.
- After completing Step 3, trigger a new Vercel deployment (or wait for the next deploy) so
  the updated server.js startup validation picks up the new env vars.
