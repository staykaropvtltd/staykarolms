# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StayKaro LMS is a multi-tenant Learning Management System with a React frontend and an Express.js backend, both connected to Supabase.

## Commands

### Frontend (root directory)
```bash
pnpm dev       # Start Vite dev server (proxies /api to localhost:3001)
pnpm build     # Production build
```

### Backend (`backend/` directory)
```bash
npm run dev    # Start with --watch (auto-restart on changes)
npm start      # Production start
```

Both must run simultaneously during development. The Vite dev server proxies all `/api/*` requests to `http://localhost:3001`.

## Environment Setup

> **Note:** `.env.example` files were intentionally deleted for security — do not recreate them.
> Request credentials directly from the team and create the files manually.

**Frontend** — create `.env` in the root directory:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key
- `VITE_API_URL` — Backend URL (leave empty in dev; Vite proxy handles it)
- `VITE_JUDGE0_KEY` — RapidAPI key for Judge0 code execution

**Backend** — create `backend/.env`:
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_KEY` — Supabase service role key (bypasses RLS)
- `FRONTEND_URL` — Allowed CORS origin
- `PORT` — Default 3001

## Architecture

### Frontend (`src/`)

**Tech stack**: React 18 + TypeScript + Vite, Tailwind CSS v4, shadcn/ui (Radix primitives), React Router v7, Recharts, Lucide React, Motion (`motion/react`)

**State management**: Local `useState` only — no Redux, no Zustand.

**Auth flow**:
1. Supabase Auth issues a JWT on login
2. `AuthContext` (`src/shared/context/AuthContext.tsx`) listens to `onAuthStateChange` and caches the token synchronously via `setCachedToken()` in `src/shared/lib/api.ts`
3. All API calls use the cached token — never call `supabase.auth.getSession()` from the API layer (it can hang on token refresh)
4. The backend verifies the JWT via `supabase.auth.getUser(token)` and fetches the user's profile from the `profiles` table

**Routing** (`src/router/routes.tsx`): Role-based route namespacing — each role has its own path prefix:
- `/super-admin/*` — super-admin only
- `/admin/*` — admin only
- `/faculty/*` — faculty only
- `/student/*` — student only

`ProtectedRoute` wraps each section and redirects unauthorized users. `DashboardLayout` provides the shared sidebar + header shell.

**API client** (`src/shared/lib/api.ts`): Single `apiFetch` helper with 60s timeout, 2-retry logic for network errors, and automatic `Authorization: Bearer <token>` injection. All backend calls go through named exports from this file.

### Backend (`backend/`)

**Tech stack**: Express.js (CommonJS), Supabase JS client with service role key.

**Middleware chain**: `authenticate` (verifies JWT, attaches `req.user`) → `requireRole(...roles)` (checks `req.user.role`).

**Route files** in `backend/routes/` map 1:1 to API prefixes registered in `server.js`. All routes use the `authenticate` middleware; sensitive routes additionally use `requireRole`.

**Audit logging**: `backend/lib/audit.js` — call to log significant actions.

### User Roles (`src/app/userTypes.ts`)

```ts
type UserType = "student" | "faculty" | "admin" | "super-admin"
```

Role is stored in the Supabase `profiles` table and read by both the backend middleware and the frontend `AuthContext`.

## UI / Design System Guidelines

From `guidelines/Guidelines.md` — these rules are mandatory:

**CSS variables only** — never hardcode hex colors:
- `var(--gold)` — primary accent
- `var(--gold-muted)` — soft gold background tint
- `var(--card)`, `var(--border)`, `var(--foreground)`, `var(--muted-foreground)`, `var(--background)`, `var(--primary)`, `var(--accent)`

**Component rules**:
- Use `StatCard` from `src/shared/components/StatCard.tsx` for all metric cards
- Use `PageHeader` from `src/shared/components/PageHeader.tsx` at the top of every page
- Never create new UI primitives — use existing ones from `src/shared/components/ui/`
- Use `toast()` from sonner for all success/error feedback
- Every page needs an empty-state illustration + message when there's no data

**Modal pattern**: `fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm`

**Adding a new page checklist**:
1. Create `src/features/[role]/NewPage.tsx` with a named export
2. Add import + route in `src/router/routes.tsx`
3. Add sidebar link in `src/shared/components/Sidebar.tsx` under the correct role's menu array
4. Keep mock/static data inside the component or co-locate it — there is no global mockData file

**Page skeleton**:
```tsx
export function NewPage() {
  return (
    <div className="p-8 space-y-6">
      <PageHeader title="..." description="..." actions={<Button>...</Button>} />
      {/* content */}
    </div>
  );
}
```

**Card pattern**: `<div className="bg-card border border-border rounded-xl p-6">`
