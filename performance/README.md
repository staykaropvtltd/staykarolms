# StayKaro LMS — k6 Performance Test Suite

Production-ready load testing suite built against the actual API surface of the
StayKaro LMS backend. Every endpoint, credential flow, and response shape was
derived from the live codebase — no placeholders.

---

## Directory Structure

```
performance/
├── .env.example            ← copy to .env and fill in credentials
├── run.sh                  ← Linux/macOS runner
├── run.ps1                 ← Windows PowerShell runner
├── helpers/
│   ├── config.js           ← env vars, thresholds, stage presets
│   ├── auth.js             ← Supabase JWT login + per-VU token cache
│   ├── http.js             ← tagged HTTP wrappers (apiGet/Post/Put/Delete)
│   ├── data.js             ← payload generators, random helpers
│   ├── resources.js        ← setup() helper: discovers live resource IDs
│   └── summary.js          ← handleSummary() → HTML + JSON + stdout
├── flows/
│   ├── student.js          ← 15-step student journey
│   ├── faculty.js          ← 12-step faculty journey
│   └── admin.js            ← 17-step admin journey
├── scenarios/
│   ├── baseline.js         ← 1 VU, 4 min — all endpoints, sanity check
│   ├── load.js             ← 50 VUs, 18 min — expected production peak
│   ├── stress.js           ← 200 VUs, 25 min — find breaking point
│   ├── spike.js            ← 0→150 VUs in 10s — class-start simulation
│   └── soak.js             ← 20 VUs, 34 min — leak / exhaustion detection
└── reports/                ← HTML + JSON output (gitignored)
```

---

## Prerequisites

### Install k6

```bash
# macOS
brew install k6

# Ubuntu / Debian
sudo gpg --no-default-keyring \
  --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 \
  --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] \
  https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Windows
winget install k6 --source winget
# OR download from https://dl.k6.io/msi/k6-latest-amd64.msi
```

### Configure credentials

```bash
cp performance/.env.example performance/.env
# edit performance/.env with real test-account credentials
```

The credentials must be users that already exist in the Supabase `profiles` table.
Create dedicated load-test accounts — do not use production admin accounts.

---

## Running Tests

### Linux / macOS

```bash
cd performance

# Single scenario
./run.sh baseline
./run.sh load
./run.sh stress
./run.sh spike
./run.sh soak

# All scenarios in sequence (takes ~90 minutes)
./run.sh all
```

### Windows (PowerShell)

```powershell
cd performance
.\run.ps1 baseline
.\run.ps1 load
.\run.ps1 all
```

### Manual k6 CLI (any OS)

```bash
k6 run \
  -e BASE_URL=http://localhost:3001 \
  -e STUDENT_EMAIL=student@test.com \
  -e STUDENT_PASSWORD=Password123! \
  -e FACULTY_EMAIL=faculty@test.com \
  -e FACULTY_PASSWORD=Password123! \
  -e ADMIN_EMAIL=admin@test.com \
  -e ADMIN_PASSWORD=Password123! \
  -e REPORT_DIR=reports \
  performance/scenarios/load.js
```

---

## Scenarios

| Scenario | VUs | Duration | Purpose |
|---|---|---|---|
| **baseline** | 1 | 4 min | Verify every endpoint, measure cold-start latency |
| **load** | 50 | 18 min | Validate SLOs under expected production peak |
| **stress** | 200 | 25 min | Find the breaking point (2×, 4× normal load) |
| **spike** | 0→150 | 9 min | Simulate all students joining a live class at once |
| **soak** | 20 | 34 min | Detect memory leaks, DB pool exhaustion, token expiry |

---

## SLO Thresholds

| Endpoint category | p95 target | p99 target |
|---|---|---|
| Health check | < 500 ms | — |
| Login / Auth | < 1 000 ms | < 2 000 ms |
| Dashboard / Analytics | < 3 000 ms | — |
| Courses, Tests, Assignments | < 1 500 ms | — |
| Messages, Notifications | < 1 000 ms | — |
| File Upload | < 10 000 ms | — |
| **Global** | **< 2 000 ms** | **< 5 000 ms** |
| **Error rate** | **< 1 %** | — |

Stress and spike scenarios use relaxed thresholds (they're expected to degrade);
the target there is to observe *how much* degradation occurs.

---

## Rate Limiting Considerations

The backend enforces these per-IP limits:

| Limiter | Window | Max |
|---|---|---|
| Auth | 15 min | 15 req |
| Read (`/api/users`, `/api/institutions`) | 1 min | 120 req |
| Upload | 1 min | 20 req |
| General (all other routes) | 1 min | 600 req |

Since k6 runs all VUs from a single IP, **high-VU tests will hit the general
limiter (600 req/min)**. 429 responses are counted in `http_req_failed` and
reflected in the error-rate threshold.

**Recommended approach for stress/spike tests:**
1. Run against a staging environment with rate limits raised or disabled.
2. Add `X-Forwarded-For` spoofing to distribute VU IPs (not available on Vercel).
3. Monitor 429s separately — they indicate infra limits, not app bugs.

---

## Reports

Each scenario emits two files in `reports/`:

- `{scenario}-{timestamp}.html` — visual dashboard (open in browser)
- `{scenario}-{timestamp}.json` — raw k6 summary data for CI parsing

The HTML report shows: p95/p99 latency, RPS, error rate, peak VUs, and a
threshold pass/fail table. Failed thresholds are highlighted in red.

---

## Interpreting Results

### Healthy baseline numbers (single-instance Vercel + Supabase free tier)

| Metric | Expected |
|---|---|
| Health check | 50–200 ms |
| Auth/login | 300–800 ms (Supabase round-trip) |
| Analytics queries | 500–2 000 ms (complex JOINs) |
| Simple list endpoints | 200–500 ms |
| File upload (1KB PNG) | 500–2 000 ms |

### Red flags to watch

| Symptom | Likely cause |
|---|---|
| p99 > 10s on analytics | Missing index on `institution_id` + `created_at` |
| 429 errors at 50 VUs | Rate limiter too aggressive for the load pattern |
| Latency creep over 30 min (soak) | Memory leak or DB connection pool exhaustion |
| 502/503 during spike | Vercel cold starts; server timeout (keepAliveTimeout) |
| Login p95 > 2s | Supabase auth is the bottleneck — add token caching |

---

## Known Bottlenecks (identified from code review)

### Critical
- **`/api/analytics/admin`**: Runs 5+ separate Supabase queries sequentially.
  Recommendation: use `Promise.all()` to parallelize or create a materialized view.

### High
- **`/api/analytics/student`**: Similar multi-query pattern without parallelism.
- **`/api/courses`** (faculty/admin): Fetches content count per course in a loop.
  Recommendation: single query with `COUNT` in a JOIN.

### Medium
- **Auth token cache**: 60-second in-memory cache per worker process. Under PM2
  with 4 workers, each worker re-verifies the same token. A shared Redis cache
  would eliminate 75% of Supabase auth calls.
- **`/api/messages`**: Groups messages in JS rather than SQL GROUP BY. Scales
  poorly as message volume grows.
- **`/api/notifications`**: `LIMIT 50` hard-coded with no cursor pagination.
  Will slow down as notification volume grows.

### Low
- **`/api/live-classes/active`**: Filters by batch/course membership in JS after
  fetching all institution live classes from DB. Add `WHERE` clause in SQL.
- **Upload endpoint**: Accepts base64 in JSON body (150 MB limit). At 20 VUs
  each uploading a video, the Node.js process handles ~3 GB of in-memory JSON.
  Recommendation: stream directly to Supabase Storage via signed upload URLs.

---

## Optimization Recommendations (ranked by impact)

1. **Parallelize analytics queries** — `Promise.all()` across the 5 independent
   Supabase queries in `/api/analytics/admin` and `/api/analytics/student`.
   Expected improvement: 60–70% latency reduction on analytics endpoints.

2. **Add a shared Redis token cache** — Already architected (Redis is optional),
   just set `REDIS_URL`. Eliminates redundant `supabase.auth.getUser()` calls
   across workers. Set TTL to 55s (just under the 60s app cache).

3. **Database indexes** — Add composite indexes on high-traffic query patterns:
   ```sql
   CREATE INDEX CONCURRENTLY idx_profiles_institution_role
     ON profiles (institution_id, role);
   CREATE INDEX CONCURRENTLY idx_enrollments_student_course
     ON course_enrollments (student_id, course_id);
   CREATE INDEX CONCURRENTLY idx_notifications_user_read
     ON notifications (user_id, is_read, created_at DESC);
   CREATE INDEX CONCURRENTLY idx_messages_participants
     ON messages (sender_id, receiver_id, created_at DESC);
   ```

4. **Cursor-based pagination** — Replace `LIMIT N` hard-codes with keyset
   pagination on high-volume list endpoints (notifications, messages, submissions).

5. **Signed upload URLs** — For file uploads, generate a Supabase Storage
   signed URL server-side and return it to the client; let the client upload
   directly. This removes the base64 + 150 MB JSON body from the Node.js process.

6. **DB connection pooling via PgBouncer** — Supabase free tier allows 60
   connections. Under stress (200 VUs), each worker may exhaust connections.
   Enable the Supabase connection pooler (port 6543, transaction mode).
