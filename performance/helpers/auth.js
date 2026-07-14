// performance/helpers/auth.js
// Per-VU login with in-memory token cache.
// k6 module state is per-VU, so each VU logs in once and reuses its token
// for the entire test run (Supabase JWTs last 1 hour by default).

import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from './config.js';

const _cache = {}; // keyed by email — per-VU

/**
 * Login and return the Supabase JWT access token.
 * Result is cached so subsequent calls within the same VU are free.
 * Returns null and logs a warning on failure.
 */
export function loginUser(email, password) {
  if (!email || !password) {
    console.warn(`[auth] Missing credentials for login (email=${email})`);
    return null;
  }

  if (_cache[email]) return _cache[email];

  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags:    { endpoint: 'login', name: 'POST /api/auth/login' },
    }
  );

  const success = check(res, {
    'login: status 200':      (r) => r.status === 200,
    'login: token in body':   (r) => {
      try { return !!JSON.parse(r.body)?.data?.session?.access_token; }
      catch { return false; }
    },
  });

  if (!success) {
    console.warn(`[auth] Login FAILED for ${email} — HTTP ${res.status}: ${res.body.slice(0, 200)}`);
    return null;
  }

  const token = JSON.parse(res.body).data.session.access_token;
  _cache[email] = token;
  return token;
}

/**
 * Build standard JSON + Authorization headers.
 */
export function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}
