// performance/helpers/http.js
// Thin wrappers around k6/http that:
//   1. Build the full URL from BASE_URL
//   2. Inject Authorization + Content-Type headers
//   3. Tag every request with { endpoint, name } for threshold matching
//   4. Run a baseline non-5xx check on every response

import http   from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from './config.js';
import { authHeaders } from './auth.js';

// Map the first path segment → endpoint tag used in thresholds.
const ENDPOINT_MAP = {
  'auth':            'login',
  'analytics':       'analytics',
  'courses':         'courses',
  'tests':           'tests',
  'attempts':        'attempts',
  'assignments':     'assignments',
  'attendance':      'attendance',
  'messages':        'messages',
  'notifications':   'notifications',
  'upload':          'upload',
  'ai-sessions':     'ai-sessions',
  'ai-questions':    'ai-questions',
  'live-classes':    'live-classes',
  'submissions':     'submissions',
  'certificates':    'certificates',
  'batches':         'batches',
  'users':           'users',
  'billing':         'billing',
  'calendar':        'calendar',
  'audit-logs':      'audit-logs',
  'support-tickets': 'support-tickets',
  'institutions':    'institutions',
  'health':          'health',
};

function endpoint(path) {
  const seg = path.replace(/^\/api\//, '').split('/')[0];
  return ENDPOINT_MAP[seg] || seg;
}

function buildParams(path, token, extraTags, params) {
  return {
    headers: token ? authHeaders(token) : { 'Content-Type': 'application/json' },
    tags: { endpoint: endpoint(path), name: `${path}`, ...extraTags },
    ...params,
  };
}

function guard(res, method, path) {
  check(res, {
    [`${method} ${path} < 500`]: (r) => r.status < 500,
  });
  return res;
}

export function apiGet(path, token, { tags = {}, params = {} } = {}) {
  return guard(http.get(`${BASE_URL}${path}`, buildParams(path, token, tags, params)), 'GET', path);
}

export function apiPost(path, body, token, { tags = {}, params = {} } = {}) {
  return guard(
    http.post(`${BASE_URL}${path}`, JSON.stringify(body), buildParams(path, token, tags, params)),
    'POST', path
  );
}

export function apiPut(path, body, token, { tags = {}, params = {} } = {}) {
  return guard(
    http.put(`${BASE_URL}${path}`, JSON.stringify(body), buildParams(path, token, tags, params)),
    'PUT', path
  );
}

export function apiDelete(path, token, { tags = {}, params = {} } = {}) {
  return guard(
    http.del(`${BASE_URL}${path}`, null, buildParams(path, token, tags, params)),
    'DELETE', path
  );
}

/** Parse `{ data }` from a k6 Response, returning [] on failure. */
export function parseList(res) {
  try {
    const body = JSON.parse(res.body);
    const d = body.data;
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

/** Extract IDs from a list response. */
export function extractIds(res, field = 'id') {
  return parseList(res).map((r) => r[field]).filter(Boolean);
}
