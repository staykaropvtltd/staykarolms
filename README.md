# StayKaro LMS

Multi-tenant Learning Management System — React frontend + Express.js backend + Supabase.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Tech Stack](#tech-stack)
3. [Local Development](#local-development)
4. [Environment Variables](#environment-variables)
5. [Project Structure](#project-structure)
6. [Deployment](#deployment)
7. [User Roles](#user-roles)
8. [Key Workflows](#key-workflows)
9. [Troubleshooting](#troubleshooting)

---

## Architecture

```
Browser
  │
  ├── Vercel (Frontend)          React + Vite SPA
  │     └── /api/*  ──────────► Vercel (Backend)    Express.js serverless
  │                                   └──────────►  Supabase (DB + Auth + Storage)
```

- **Frontend** lives at the repo root (`src/`, `index.html`, `vite.config.ts`)
- **Backend** lives in `backend/` — a standalone Express app
- Both deployed as **separate Vercel projects** from the same GitHub repository
- Local dev: Vite proxies all `/api/*` requests to `http://localhost:3001`

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, React Router v7 |
| Backend | Node.js, Express.js (CommonJS), PM2 (VPS) |
| Database | Supabase (PostgreSQL + PostgREST + Auth + Storage) |
| UI components | Radix UI primitives, Lucide icons, Recharts, Motion |
| Hosting | Vercel (frontend + backend) or Render (backend with PM2 cluster) |

---

## Local Development

### Prerequisites
- Node.js 18+
- pnpm (`npm i -g pnpm`)

### 1. Clone and install

```bash
git clone https://github.com/YOUR_ORG/staykaro-lms.git
cd staykaro-lms

# Frontend
pnpm install

# Backend
cd backend && npm install && cd ..
```

### 2. Create environment files

**Frontend** — create `.env` in the project root:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=
VITE_JUDGE0_KEY=your_rapidapi_key
```
> `VITE_API_URL` stays **empty** in local dev — Vite proxies `/api/*` to `localhost:3001` automatically.

**Backend** — create `backend/.env`:
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
FRONTEND_URL=http://localhost:5173
PORT=3001
```

> Get credentials from the team lead — never commit `.env` files.

### 3. Start both servers

Open **two terminals**:

```bash
# Terminal 1 — Frontend (http://localhost:5173)
pnpm dev

# Terminal 2 — Backend (http://localhost:3001)
cd backend && npm run dev
```

Both must run at the same time. The frontend auto-proxies API calls to the backend.

---

## Environment Variables

### Frontend (`.env` at repo root)

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase public anon key |
| `VITE_API_URL` | No | Backend URL — empty in dev (Vite proxies), set in prod |
| `VITE_JUDGE0_KEY` | No | RapidAPI key for code execution (Judge0) |

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key (bypasses RLS — keep secret) |
| `FRONTEND_URL` | Yes | Allowed CORS origin |
| `PORT` | No | Defaults to 3001 |
| `REDIS_URL` | No | Redis connection string — enables shared rate limiting across PM2 workers |

---

## Project Structure

```
staykaro-lms/
├── src/                          Frontend source
│   ├── features/                 Page components grouped by feature
│   │   ├── admin/                Admin-only pages
│   │   ├── auth/                 Login page
│   │   ├── common/               Pages shared across roles (Certificates, etc.)
│   │   ├── faculty/              Faculty-only pages
│   │   ├── student/              Student-only pages
│   │   └── super-admin/          Super-admin pages
│   ├── router/
│   │   ├── routes.tsx            All routes — role-namespaced paths
│   │   └── ProtectedRoute.tsx    Role guard wrapper
│   └── shared/
│       ├── components/           Reusable UI (StatCard, PageHeader, Sidebar…)
│       ├── context/
│       │   └── AuthContext.tsx   Supabase auth + token cache
│       ├── lib/
│       │   └── api.ts            All backend API calls (single file)
│       └── userTypes.ts          UserType definition
│
├── backend/
│   ├── routes/                   One file per API prefix
│   │   ├── auth.js               /api/auth
│   │   ├── certificates.js       /api/certificates
│   │   ├── courses.js            /api/courses
│   │   └── ...
│   ├── middleware/
│   │   ├── auth.js               JWT verification → req.user
│   │   └── roleGuard.js          requireRole(...roles)
│   ├── lib/
│   │   ├── supabase.js           Supabase client (service key)
│   │   └── audit.js              Audit log helper
│   ├── server.js                 Express app + middleware + route registration
│   ├── ecosystem.config.js       PM2 cluster config (VPS/Render)
│   └── vercel.json               Vercel serverless adapter config
│
├── supabase/migrations/          SQL migration files (run via Supabase CLI)
├── vercel.json                   Frontend Vercel config
├── render.yaml                   Backend Render config (alternative to Vercel)
└── vite.config.ts                Vite config + /api proxy for local dev
```

---

## Deployment

### Option A — Vercel (Free tier, recommended for teams starting out)

> **Free tier limit**: 100,000 serverless function calls/day.
> Fine for development and small launches. For 500+ daily-active users in production, upgrade to **Vercel Pro ($20/mo)**.

#### Step 1 — Push to GitHub

```bash
git add .
git commit -m "your message"
git push origin main
```

#### Step 2 — Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repo
3. Vercel detects Vite automatically from `vercel.json`
4. Add environment variables (Settings → Environment Variables):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_URL` = `https://staykaro-api.vercel.app` ← your backend URL (fill after Step 3)
   - `VITE_JUDGE0_KEY`
5. Deploy

#### Step 3 — Deploy Backend to Vercel (separate project)

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import the **same GitHub repo**
3. Under **Root Directory** → set it to `backend`
4. Vercel detects `backend/vercel.json` automatically
5. Add environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `FRONTEND_URL` = your frontend Vercel URL
   - `NODE_ENV` = `production`
6. Deploy — note the URL (e.g. `https://staykaro-api.vercel.app`)
7. Go back to the **frontend** project and set `VITE_API_URL` to this URL, then redeploy

#### Redeploy after code changes

Vercel auto-deploys on every `git push origin main`. No manual steps needed.

---

### Option B — Render (Recommended for 500+ concurrent users)

Use this when you need PM2 cluster mode (multi-core), persistent processes, or have heavy traffic.

1. Go to [render.com](https://render.com) → **New Web Service**
2. Connect GitHub repo
3. Render reads `render.yaml` automatically
4. Add the secret env vars in the Render dashboard (Environment tab):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
5. Set plan to **Standard** (1 CPU, 2 GB RAM) — minimum for 500 users
6. Deploy

| Plan | Concurrent Users | Cost |
|---|---|---|
| Render Free | ~30 (spins down after 15 min idle) | $0 |
| Render Starter | ~80 | $7/mo |
| Render Standard | ~400 | $25/mo |
| Render Pro (2 CPU) | ~700 | $85/mo |

---

## User Roles

| Role | Path prefix | Description |
|---|---|---|
| `super-admin` | `/super-admin/*` | StayKaro team — oversees all institutions |
| `admin` | `/admin/*` | Institution admin — manages one school/org |
| `faculty` | `/faculty/*` | Trainer — creates content, runs live classes |
| `student` | `/student/*` | Learner — takes courses, tests, gets certificates |

Role is stored in the Supabase `profiles` table. The backend middleware reads it from the JWT via `req.user.role`.

---

## Key Workflows

### Adding a new page

1. Create `src/features/<role>/MyPage.tsx` with a named export
2. Add the route in `src/router/routes.tsx`
3. Add a sidebar link in `src/shared/components/Sidebar.tsx` under the correct role's menu
4. Add any new API calls to `src/shared/lib/api.ts`
5. Add the backend route in `backend/routes/myroute.js` and register it in `backend/server.js`

### Adding a new API endpoint

1. Create or edit a file in `backend/routes/`
2. Register it in `backend/server.js` with `app.use("/api/myroute", require("./routes/myroute"))`
3. Add the matching frontend function in `src/shared/lib/api.ts`

### Auth flow

1. User logs in → Supabase issues a JWT
2. `AuthContext` caches the token via `setCachedToken()` in `api.ts`
3. Every API call sends `Authorization: Bearer <token>`
4. Backend `authenticate` middleware calls `supabase.auth.getUser(token)`, fetches the profile, attaches `req.user`
5. `requireRole(...roles)` checks `req.user.role` for protected routes

### Certificate flow (student)

1. Student completes all lessons in a course → backend auto-generates a certificate (`POST /api/certificates/generate`)
2. Student visits **Certificates** page → sees their earned certificates
3. Clicks **View / Download** → opens `/certificates/:code/view` (public page)
4. Downloads as PDF via `html2canvas` + `jsPDF`

Admin bulk-issues certificates via **Admin → Certificates → Bulk Issue** → picks a course and optional batch → calls `POST /api/certificates/bulk-generate`.

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Frontend shows blank page | `VITE_SUPABASE_URL` not set | Check `.env` at repo root |
| API calls return 401 | Token not cached or expired | Check browser console for `[API]` logs; try logging out and back in |
| API calls return 502 | Backend not running or wrong `VITE_API_URL` | Start backend with `cd backend && npm run dev`; check `.env` |
| CORS error | `FRONTEND_URL` mismatch in backend `.env` | Set `FRONTEND_URL` exactly to `http://localhost:5173` in dev |
| Login loop | Supabase anon key wrong | Check `VITE_SUPABASE_ANON_KEY` |
| Upload fails on Vercel | Vercel free tier body limit is 4.5 MB | Upgrade to Vercel Pro (50 MB) or use Render for the backend |
| PM2 cluster rate limits not shared | No Redis configured | Add `REDIS_URL` to env — see Environment Variables above |
