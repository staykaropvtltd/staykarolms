// performance/flows/examFlow.js
// Realistic online exam flow.
//
// Token is supplied from setup() — shared across all VUs so the auth rate limiter
// (15 logins / 15 min per IP) is never triggered during high-concurrency tests.
//
// Answer strategy: per-question think time (8–30 s each) is retained for realism,
// but all answers are submitted in ONE batch POST after the think loop.
// This reduces answer-phase HTTP calls from N (one per question) to 1, cutting
// Supabase write pressure by N× without compressing the exam session duration.
//
// Each VU call simulates ONE student's exam session:
//   Dashboard → Tests List → Fetch Exam → Start/Resume Attempt →
//   Think through questions (8–30 s each, no HTTP) →
//   Batch POST all answers → Submit → View Result

import http         from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { BASE_URL } from '../helpers/config.js';

// ── Custom metrics ────────────────────────────────────────────
export const examStarts    = new Counter('exam_starts_ok');
export const examStartFail = new Counter('exam_starts_fail');
export const answersSaved  = new Counter('exam_answers_saved');   // count of individual answers saved
export const answerBatchOK = new Counter('exam_answer_batch_ok'); // batch calls that succeeded
export const answerBatchFail = new Counter('exam_answer_batch_fail');
export const submitOK      = new Counter('exam_submits_ok');
export const submitFail    = new Counter('exam_submits_fail');
export const examE2E       = new Trend('exam_e2e_ms', true);

function jitter(min, max) {
  return min + Math.random() * (max - min);
}

function authH(token) {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

/**
 * Full exam session for a single VU.
 * @param {object} ctx  - from setup(): { token, testId, questions }
 */
export function examFlow(ctx) {
  if (!ctx || !ctx.token) {
    console.warn('[examFlow] No token in context — skipping VU');
    return;
  }

  const { token, testId, questions } = ctx;
  const t0 = Date.now();

  // ── 1. Dashboard ──────────────────────────────────────────────
  const dashRes = http.get(`${BASE_URL}/api/analytics/student`, {
    headers: authH(token),
    tags: { endpoint: 'analytics', name: 'GET /api/analytics/student', flow: 'exam' },
  });
  check(dashRes, { 'exam: dashboard 200': (r) => r.status === 200 });

  // Sidebar notification badge — always fired on page load
  http.get(`${BASE_URL}/api/notifications/unread/count`, {
    headers: authH(token),
    tags: { endpoint: 'notifications', name: 'GET /api/notifications/unread/count', flow: 'exam' },
  });

  sleep(jitter(1, 2)); // student glances at dashboard

  // ── 2. Tests list ──────────────────────────────────────────────
  const testsRes = http.get(`${BASE_URL}/api/tests?status=published`, {
    headers: authH(token),
    tags: { endpoint: 'tests', name: 'GET /api/tests', flow: 'exam' },
  });
  check(testsRes, { 'exam: tests list 200': (r) => r.status === 200 });

  if (!testId) {
    examE2E.add(Date.now() - t0);
    return;
  }

  sleep(jitter(0.5, 1.5)); // student picks a test

  // ── 3. Fetch exam detail + questions ───────────────────────────
  const examRes = http.get(`${BASE_URL}/api/tests/${testId}`, {
    headers: authH(token),
    tags: { endpoint: 'tests', name: 'GET /api/tests/:id', flow: 'exam' },
  });
  check(examRes, {
    'exam: test detail 200': (r) => r.status === 200,
    'exam: has questions':   (r) => {
      try { return Array.isArray(JSON.parse(r.body)?.data?.test_questions); }
      catch { return false; }
    },
  });

  sleep(jitter(2, 5)); // student reads instructions

  // ── 4. Start / resume attempt ──────────────────────────────────
  const startRes = http.post(
    `${BASE_URL}/api/attempts/start`,
    JSON.stringify({ test_id: testId }),
    {
      headers: authH(token),
      tags: { endpoint: 'attempts', name: 'POST /api/attempts/start', flow: 'exam' },
    }
  );

  const startOk = check(startRes, {
    'exam: start 2xx':  (r) => r.status === 200 || r.status === 201,
    'exam: attempt id': (r) => {
      try { return !!JSON.parse(r.body)?.data?.id; }
      catch { return false; }
    },
  });

  if (!startOk) {
    examStartFail.add(1);
    examE2E.add(Date.now() - t0);
    return;
  }
  examStarts.add(1);

  let attemptId;
  try { attemptId = JSON.parse(startRes.body)?.data?.id; } catch { /* no-op */ }
  if (!attemptId) { examE2E.add(Date.now() - t0); return; }

  // ── 5. Think through questions (per-question delay, no HTTP) ───
  // Think time is preserved (8–30 s per question) for session-length realism.
  // Answers are collected client-side and sent in one batch call (step 6).
  const qs = questions || [];
  const answersToSave = [];

  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    if (!q || !q.id) continue;

    // Realistic per-question think time
    sleep(jitter(8, 30));

    let opts = q.options;
    if (typeof opts === 'string') {
      try { opts = JSON.parse(opts); } catch { opts = []; }
    }

    let answer;
    if (q.type === 'mcq' && Array.isArray(opts) && opts.length > 0) {
      answer = opts[Math.floor(Math.random() * opts.length)];
    } else if (q.type === 'mcq') {
      answer = String.fromCharCode(97 + Math.floor(Math.random() * 4));
    } else {
      answer = `Test answer ${i + 1} from VU`;
    }

    answersToSave.push({ question_id: q.id, answer });
  }

  // ── 6. Batch save all answers — one HTTP call replaces N ───────
  // The upsert on (attempt_id, question_id) is idempotent, so batching is safe.
  if (answersToSave.length > 0) {
    sleep(jitter(0.5, 1)); // brief pause before submitting (student reviews)

    const batchRes = http.post(
      `${BASE_URL}/api/attempts/${attemptId}/answers`,
      JSON.stringify({ answers: answersToSave }),
      {
        headers: authH(token),
        tags: { endpoint: 'attempts', name: 'POST /api/attempts/:id/answers', flow: 'exam' },
      }
    );

    const batchOk = check(batchRes, {
      'exam: answers batch saved': (r) => r.status === 200,
    });

    if (batchOk) {
      answerBatchOK.add(1);
      answersSaved.add(answersToSave.length);
    } else {
      answerBatchFail.add(1);
    }
  }

  sleep(jitter(1, 3)); // student reviews before submit

  // ── 7. Submit exam ─────────────────────────────────────────────
  const subRes = http.post(
    `${BASE_URL}/api/attempts/${attemptId}/submit`,
    JSON.stringify({}),
    {
      headers: authH(token),
      tags: { endpoint: 'attempts', name: 'POST /api/attempts/:id/submit', flow: 'exam' },
    }
  );

  const subOk = check(subRes, {
    'exam: submit 200':     (r) => r.status === 200,
    'exam: score returned': (r) => {
      try { return typeof JSON.parse(r.body)?.data?.score !== 'undefined'; }
      catch { return false; }
    },
  });

  if (subOk) { submitOK.add(1); }
  else        { submitFail.add(1); }

  sleep(jitter(1, 2));

  // ── 8. View result ─────────────────────────────────────────────
  if (subOk) {
    http.get(`${BASE_URL}/api/attempts/${attemptId}/result`, {
      headers: authH(token),
      tags: { endpoint: 'attempts', name: 'GET /api/attempts/:id/result', flow: 'exam' },
    });
  }

  examE2E.add(Date.now() - t0);
}
