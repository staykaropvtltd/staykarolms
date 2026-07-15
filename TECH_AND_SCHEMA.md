# StayKaro LMS — Tech Stack & Database Schema

> Reference document for teammates building test files or exploring the codebase.
> Supabase project: `ednbllvuiwgdbejosozu` · URL: `https://ednbllvuiwgdbejosozu.supabase.co`

---

## Tech Stack

### Frontend

| Layer | Technology | Notes |
|---|---|---|
| Framework | React 18 + TypeScript | Vite 6 bundler |
| Styling | Tailwind CSS v4 | CSS variables only (no hardcoded hex) |
| UI components | shadcn/ui (Radix primitives) | All in `src/shared/components/ui/` |
| Routing | React Router v7 | Role-based namespacing `/student/*`, `/admin/*`, etc. |
| Charts | Recharts 2 | Used in analytics/dashboard pages |
| Animations | Motion (`motion/react`) 12 | Framer Motion successor |
| Auth client | @supabase/supabase-js v2 | Listens to `onAuthStateChange`; caches JWT synchronously |
| HTTP client | Custom `apiFetch` | `src/shared/lib/api.ts` — 60 s timeout, 2-retry, auto Bearer header |
| Forms | react-hook-form 7 | |
| Toasts | Sonner 2 | |
| PDF / certs | jsPDF + html2canvas | Certificate generation |
| E2E testing | Playwright 1.60 | `tests/` directory |
| Package manager | pnpm 10 | |

State management: **local `useState` only** — no Redux, no Zustand.

### Backend

| Layer | Technology | Notes |
|---|---|---|
| Runtime | Node.js (CommonJS) | |
| Framework | Express 4 | |
| Database client | @supabase/supabase-js v2 | Service role key — bypasses RLS |
| Auth middleware | Custom `authenticate` | Verifies JWT via `supabase.auth.getUser(token)` |
| Role guard | Custom `requireRole` | Checks `req.user.role` set by `authenticate` |
| Caching | ioredis + Redis | 60 s profile cache keyed by `profile:<userId>` |
| Rate limiting | express-rate-limit + rate-limit-redis | 600 req/min general; 100/15 min auth |
| Security headers | Helmet 8 | |
| Compression | compression (gzip/br) | ~60–80 % JSON size reduction |
| Process manager | PM2 7 | Cluster mode on VPS; single worker on Vercel |
| Unit tests | Jest 29 + Supertest 7 | `backend/tests/**/*.test.js` |

### Infrastructure & Deployment

| Service | Provider | Details |
|---|---|---|
| Frontend hosting | Vercel | `staykarolms-six.vercel.app` · auto-deploy from `main` |
| Backend hosting | Vercel (serverless) | `staykarolmsbackend.vercel.app` · same repo, `backend/` subfolder |
| Database | Supabase PostgreSQL | Project `ednbllvuiwgdbejosozu` · region ap-south-1 |
| Auth | Supabase Auth | ES256 JWT · `onAuthStateChange` on frontend |
| File storage | Supabase Storage | Course videos, assignment PDFs, avatars |
| Cache / queue | Redis (Upstash or similar) | `REDIS_URL` env var on Vercel |
| Code execution | Judge0 (RapidAPI) | Student coding questions · `VITE_JUDGE0_KEY` |
| CI/CD | Vercel GitHub integration | Push to `main` → instant deploy |

### Auth Flow

```
User logs in → POST /api/auth/login
  → supabase.auth.signInWithPassword()
  → profile fetched from DB (role, institution_id)
  → JWT returned to frontend

Frontend: AuthContext caches token synchronously via setCachedToken()
          All API calls: Authorization: Bearer <token>

Backend middleware chain:
  authenticate  → supabase.auth.getUser(token) → profile from DB (Redis-cached 60 s)
  requireRole() → checks req.user.role
```

### Key Environment Variables

**Frontend (`.env`):**
- `VITE_SUPABASE_URL` — `https://ednbllvuiwgdbejosozu.supabase.co`
- `VITE_SUPABASE_ANON_KEY` — public anon key
- `VITE_JUDGE0_KEY` — RapidAPI key for code execution

**Backend (`backend/.env`):**
- `SUPABASE_URL` — same as above
- `SUPABASE_SERVICE_KEY` — service role key (bypasses RLS)
- `FRONTEND_URL` — CORS allowed origin
- `REDIS_URL` — Redis connection string
- `PORT` — default 3001

---

## Database Schema

All tables live in the `public` schema. Row Level Security (RLS) is enabled on every table; the backend uses the service role key which bypasses RLS.

### Entity Relationship Overview

```
institutions
  └── profiles (users)          — institution_id FK
  └── courses                   — institution_id FK
        └── enrollments         — course_id + student_id
        └── course_content      — course_id
        └── assignments         — course_id
              └── assignment_submissions
        └── attendance          — course_id + student_id
        └── lesson_completions  — course_id + student_id
  └── batches                   — institution_id FK
        └── batch_students      — batch_id + student_id
        └── batch_courses       — batch_id + course_id
  └── tests                     — institution_id FK
        └── test_questions
        └── test_attempts       — test_id + student_id
              └── test_answers
  └── live_classes              — institution_id FK
        └── live_class_attendance
  └── notifications             — user_id FK
  └── messages                  — sender_id + receiver_id
  └── calendar_events           — institution_id FK
  └── certificates              — student_id + course_id
  └── billing                   — institution_id FK
  └── ai_sessions               — student_id FK
  └── ai_interview_questions    — institution_id FK
  └── audit_logs                — actor_id FK
  └── support_tickets           — institution_id FK
        └── support_ticket_messages
```

---

### Table Reference

#### `profiles`
Extends Supabase `auth.users`. Created automatically on signup via trigger.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | = `auth.users.id` |
| `name` | text | |
| `email` | text | |
| `role` | text | `'super-admin' \| 'admin' \| 'faculty' \| 'student'` |
| `institution_id` | uuid | FK → `institutions.id` |
| `avatar_url` | text | |
| `created_at` | timestamptz | |

---

#### `institutions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | |
| `logo_url` | text | |
| `plan` | text | default `'basic'` |
| `created_at` | timestamptz | |

---

#### `courses`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `title` | text | |
| `description` | text | |
| `institution_id` | uuid | FK → `institutions` |
| `faculty_id` | uuid | FK → `profiles` |
| `thumbnail_url` | text | |
| `status` | text | default `'active'` |
| `created_at` | timestamptz | |

---

#### `course_content`
Individual lessons/videos within a course.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `course_id` | uuid | FK → `courses` |
| `title` | text | |
| `type` | text | `'video' \| 'pdf' \| 'quiz' \| 'code' \| 'reading'` |
| `url` | text | |
| `description` | text | |
| `duration_mins` | int | |
| `order_index` | int | default 0 |
| `created_by` | uuid | FK → `profiles` |
| `created_at` | timestamptz | |

---

#### `enrollments`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `course_id` | uuid | FK → `courses` |
| `student_id` | uuid | FK → `profiles` |
| `progress` | int | 0–100, default 0 |
| `enrolled_at` | timestamptz | |
| **UNIQUE** | (course_id, student_id) | |

---

#### `batches`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | |
| `institution_id` | uuid | FK → `institutions` |
| `course_id` | uuid | FK → `courses` |
| `mentor_id` | uuid | FK → `profiles` |
| `description` | text | |
| `start_date` | date | |
| `end_date` | date | |
| `created_at` | timestamptz | |

---

#### `batch_students`

| Column | Type | Notes |
|---|---|---|
| `batch_id` | uuid | FK → `batches` |
| `student_id` | uuid | FK → `profiles` |
| **PK** | (batch_id, student_id) | |

---

#### `batch_courses`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `batch_id` | uuid | FK → `batches` |
| `course_id` | uuid | FK → `courses` |
| `assigned_at` | timestamptz | |
| **UNIQUE** | (batch_id, course_id) | |

---

#### `tests`
Exams (aptitude, coding, mock).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `title` | text | |
| `type` | text | `'coding' \| 'aptitude' \| 'mock'` |
| `institution_id` | uuid | FK → `institutions` |
| `created_by` | uuid | FK → `profiles` |
| `batch_id` | uuid | FK → `batches` (nullable — null = all students) |
| `duration_mins` | int | required |
| `scheduled_at` | timestamptz | optional |
| `status` | text | `'draft' \| 'published'` — students only see `'published'` |
| `created_at` | timestamptz | |

---

#### `test_questions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `test_id` | uuid | FK → `tests` |
| `question` | text | |
| `type` | text | `'mcq' \| 'coding' \| 'short'` |
| `options` | text | JSON-encoded array of strings for MCQ, e.g. `'["A","B","C","D"]'` — parse with `JSON.parse()` |
| `correct_answer` | text | stripped from student response |
| `marks` | int | default 1 |
| `order_index` | int | default 0 |

---

#### `test_attempts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `test_id` | uuid | FK → `tests` |
| `student_id` | uuid | FK → `profiles` |
| `started_at` | timestamptz | |
| `submitted_at` | timestamptz | |
| `score` | int | |
| `status` | text | `'in_progress' \| 'submitted'` |

---

#### `test_answers`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `attempt_id` | uuid | FK → `test_attempts` |
| `question_id` | uuid | FK → `test_questions` |
| `answer` | text | |
| `is_correct` | boolean | |
| `marks_awarded` | int | default 0 |
| **UNIQUE** | (attempt_id, question_id) | upsert-safe |

---

#### `assignments`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `title` | text | |
| `description` | text | |
| `course_id` | uuid | FK → `courses` |
| `created_by` | uuid | FK → `profiles` |
| `due_date` | timestamptz | |
| `max_marks` | int | default 100 |
| `status` | text | default `'active'` |
| `created_at` | timestamptz | |

---

#### `assignment_submissions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `assignment_id` | uuid | FK → `assignments` |
| `student_id` | uuid | FK → `profiles` |
| `file_url` | text | |
| `submitted_at` | timestamptz | |
| `grade` | int | |
| `feedback` | text | |
| `graded_by` | uuid | FK → `profiles` |
| **UNIQUE** | (assignment_id, student_id) | |

---

#### `attendance`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `student_id` | uuid | FK → `profiles` |
| `course_id` | uuid | FK → `courses` |
| `date` | date | |
| `status` | text | `'present' \| 'absent' \| 'late'` |
| **UNIQUE** | (student_id, course_id, date) | upsert-safe |

---

#### `live_classes`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `title` | text | |
| `course_id` | uuid | FK → `courses` |
| `batch_id` | uuid | FK → `batches` |
| `institution_id` | uuid | FK → `institutions` |
| `created_by` | uuid | FK → `profiles` |
| `scheduled_at` | timestamptz | |
| `duration_mins` | int | default 60 |
| `platform` | text | `'zoom' \| 'google_meet' \| 'ms_teams' \| 'platform'` |
| `meeting_link` | text | |
| `meeting_id` | text | |
| `status` | text | `'upcoming' \| 'live' \| 'completed' \| 'cancelled'` |
| `description` | text | |
| `created_at` | timestamptz | |

Realtime enabled via `supabase_realtime` publication.

---

#### `live_class_attendance`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `live_class_id` | uuid | FK → `live_classes` |
| `student_id` | uuid | FK → `profiles` |
| `status` | text | `'present' \| 'absent'` |
| `responded_at` | timestamptz | |
| **UNIQUE** | (live_class_id, student_id) | |

---

#### `notifications`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | FK → `profiles` |
| `title` | text | |
| `message` | text | |
| `type` | text | `'success' \| 'info' \| 'warning' \| 'error'` |
| `category` | text | `'system' \| 'academic' \| 'assignment' \| 'certificate'` |
| `read` | boolean | default false |
| `created_at` | timestamptz | |

---

#### `messages`
Direct messages between users.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `sender_id` | uuid | FK → `profiles` |
| `receiver_id` | uuid | FK → `profiles` |
| `content` | text | |
| `read` | boolean | default false |
| `created_at` | timestamptz | |

---

#### `calendar_events`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `title` | text | |
| `type` | text | `'live' \| 'doubt' \| 'workshop' \| 'exam' \| 'holiday' \| 'assignment'` |
| `course_id` | uuid | FK → `courses` |
| `institution_id` | uuid | FK → `institutions` |
| `created_by` | uuid | FK → `profiles` |
| `scheduled_at` | timestamptz | |
| `end_at` | timestamptz | |
| `duration_mins` | int | |
| `description` | text | |
| `created_at` | timestamptz | |

---

#### `certificates`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `student_id` | uuid | FK → `profiles` |
| `course_id` | uuid | FK → `courses` |
| `issued_at` | timestamptz | |
| `file_url` | text | |
| `verification_code` | text UNIQUE | 8-byte hex, auto-generated |

---

#### `billing`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `institution_id` | uuid | FK → `institutions` |
| `plan` | text | |
| `amount` | numeric | |
| `status` | text | default `'paid'` |
| `paid_at` | timestamptz | |
| `invoice_url` | text | |

---

#### `ai_sessions`
AI mock interview sessions.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `student_id` | uuid | FK → `profiles` |
| `track` | text | e.g. `'frontend'`, `'backend'` |
| `difficulty` | text | |
| `duration_mins` | int | |
| `score` | int | |
| `feedback` | text | |
| `questions` | jsonb | full Q&A array |
| `created_at` | timestamptz | |

---

#### `ai_interview_questions`
Question bank for AI sessions.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `institution_id` | uuid | FK → `institutions` (nullable = global) |
| `created_by` | uuid | FK → `profiles` |
| `question` | text | |
| `category` | text | default `'General'` |
| `difficulty` | text | default `'Medium'` |
| `track` | text | default `'general'` |
| `answer_guide` | text | |
| `created_at` | timestamptz | |

---

#### `audit_logs`
Super-admin read-only. Written by backend on sensitive actions.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `actor_id` | uuid | FK → `profiles` |
| `actor_email` | text | |
| `actor_role` | text | |
| `action` | text | e.g. `'test_create'`, `'user_delete'` |
| `resource` | text | table name |
| `resource_id` | text | |
| `severity` | text | `'info' \| 'warning' \| 'critical'` |
| `ip_address` | text | |
| `status` | text | `'success' \| 'failed'` |
| `metadata` | jsonb | arbitrary context |
| `created_at` | timestamptz | |

---

#### `support_tickets`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `subject` | text | |
| `institution_id` | uuid | FK → `institutions` |
| `raised_by` | uuid | FK → `profiles` |
| `priority` | text | `'low' \| 'medium' \| 'high' \| 'critical'` |
| `status` | text | `'open' \| 'in_progress' \| 'resolved' \| 'closed'` |
| `category` | text | `'billing' \| 'technical' \| 'account' \| 'feature_request'` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

#### `support_ticket_messages`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `ticket_id` | uuid | FK → `support_tickets` |
| `sender_id` | uuid | FK → `profiles` |
| `content` | text | |
| `is_staff` | boolean | default false |
| `created_at` | timestamptz | |

---

## API Route Map

All routes are prefixed `/api/` and deployed at `https://staykarolmsbackend.vercel.app`.

| Method | Route | Role required | Description |
|---|---|---|---|
| POST | `/auth/login` | public | Login, returns JWT + profile |
| POST | `/auth/signup` | public | Register new user |
| GET | `/users` | admin, faculty, super-admin | List users by institution |
| GET | `/courses` | all | List courses |
| POST | `/courses` | admin, faculty, super-admin | Create course |
| GET | `/tests` | all | List tests (students: published only) |
| POST | `/tests` | admin, faculty, super-admin | Create test draft |
| PUT | `/tests/:id/publish` | admin, faculty, super-admin | Publish + notify students |
| GET | `/tests/:id` | all | Test detail + questions |
| POST | `/tests/:id/questions` | admin, faculty, super-admin | Add question |
| POST | `/attempts/start` | student | Start exam attempt |
| POST | `/attempts/:id/answer` | student | Save answer |
| POST | `/attempts/:id/submit` | student | Submit exam |
| GET | `/notifications` | all | List notifications |
| GET | `/notifications/unread/count` | all | Unread count |
| GET | `/analytics/dashboard` | all | Role-based dashboard stats |
| GET | `/batches` | all | List batches |
| POST | `/batches` | admin, super-admin | Create batch |
| GET | `/messages/:userId` | all | Conversation with user |
| POST | `/messages` | all | Send message |
| GET | `/calendar` | all | List events |
| GET | `/certificates` | all | List certificates |
| GET | `/billing` | admin, super-admin | Billing records |
| GET | `/audit-logs` | super-admin | Audit logs |
| GET | `/support-tickets` | admin, super-admin | Support tickets |
| GET | `/health` | public | Service health check |

---

## Writing Backend Tests

Tests live in `backend/tests/`. Run with:

```bash
cd backend && npm test
# or with coverage:
npm run test:coverage
```

Jest + Supertest setup. The test environment is Node (no browser). Pattern: `backend/tests/**/*.test.js`.

### Minimal test skeleton

```js
// backend/tests/tests.test.js
const request = require('supertest');
const app = require('../server');

// Login once and share token
let token;
beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'student@college.edu', password: 'TestE2E@2024' });
  token = res.body.data.session.access_token;
});

describe('GET /api/tests', () => {
  it('returns published tests for student', async () => {
    const res = await request(app)
      .get('/api/tests')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
```

### Test credentials

| Role | Email | Password |
|---|---|---|
| student | `student@college.edu` | `TestE2E@2024` |

> Admin/faculty credentials: request from team. The `institution_id` for `student@college.edu` is `27a0e92e-5227-4855-b276-3c1d08ab5dcb`.

### Key invariants to test

- Students get `status: 'published'` tests only — never drafts
- `correct_answer` is stripped from question objects returned to students
- `institution_id` scoping: users from institution A cannot see data from institution B
- Attempt start (`POST /attempts/start`) returns `{ data: { id, status: 'in_progress', ... } }`; use that `id` for subsequent calls
- Answer save: `POST /attempts/:id/answer` with `{ question_id, answer }`
- Submit: `POST /attempts/:id/submit` — sets `status: 'submitted'` and populates `score`
- `options` on questions is a JSON string; call `JSON.parse(q.options)` before using
