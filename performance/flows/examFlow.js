// performance/flows/examFlow.js
// Realistic online exam flow for a single student VU.
// Simulates: Login → Dashboard → Tests List → Fetch Exam → Start Attempt →
//            Answer Questions (with think time) → Submit → View Result → Logout

import http    from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { BASE_URL } from '../helpers/config.js';

// ── Custom metrics ────────────────────────────────────────────
export const loginOK      = new Counter('exam_logins_ok');
export const loginFail    = new Counter('exam_logins_fail');
export const examStart    = new Counter('exam_starts_ok');
export const examFail     = new Counter('exam_starts_fail');
export const answersSaved = new Counter('exam_answers_saved');
export const submitOK     = new Counter('exam_submits_ok');
export const submitFail   = new Counter('exam_submits_fail');
export const examLatency  = new Trend('exam_e2e_latency_ms', true);

function jitter(min, max) {
  return min + Math.random() * (max - min);
}

function authHeaders(token) {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

function jsonHeaders() {
  return { 'Content-Type': 'application/json' };
}

/**
 * Full exam flow.
 * @param {object} ctx - shared data from setup(): { testId, publishedTestIds, questionCount }
 */
export function examFlow(ctx) {
  const email    = __ENV.STUDENT_EMAIL    || '';
  const password = __ENV.STUDENT_PASSWORD || '';
  const vuStart  = Date.now();

  // ── 1. Login ─────────────────────────────────────────────────
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password }),
    {
      headers: jsonHeaders(),
      tags: { endpoint: 'login', name: 'POST /api/auth/login', flow: 'exam' },
    }
  );

  const loginOk = check(loginRes, {
    'exam: login 200':          (r) => r.status === 200,
    'exam: token present':      (r) => {
      try { return !!JSON.parse(r.body)?.data?.session?.access_token; }
      catch { return false; }
    },
  });

  if (!loginOk) {
    loginFail.add(1);
    console.warn(`[examFlow] Login failed — HTTP ${loginRes.status}: ${loginRes.body.slice(0, 150)}`);
    return;
  }
  loginOK.add(1);

  let token;
  try { token = JSON.parse(loginRes.body).data.session.access_token; }
  catch { return; }

  sleep(jitter(0.5, 1.5)); // student lands on dashboard

  // ── 2. Dashboard (student analytics) ─────────────────────────
  http.get(`${BASE_URL}/api/analytics/student`, {
    headers: authHeaders(token),
    tags: { endpoint: 'analytics', name: 'GET /api/analytics/student', flow: 'exam' },
  });

  // Unread notifications count (sidebar badge)
  http.get(`${BASE_URL}/api/notifications/unread/count`, {
    headers: authHeaders(token),
    tags: { endpoint: 'notifications', name: 'GET /api/notifications/unread/count', flow: 'exam' },
  });

  sleep(jitter(1, 2)); // student reads dashboard

  // ── 3. Tests list ─────────────────────────────────────────────
  const testsRes = http.get(`${BASE_URL}/api/tests?status=published`, {
    headers: authHeaders(token),
    tags: { endpoint: 'tests', name: 'GET /api/tests', flow: 'exam' },
  });

  check(testsRes, { 'exam: tests list 200': (r) => r.status === 200 });

  // Pick the test ID — prefer one from setup(), fall back to first in list
  let testId = ctx && ctx.testId;
  if (!testId) {
    try {
      const tests = JSON.parse(testsRes.body)?.data || [];
      testId = tests[0]?.id;
    } catch { /* no-op */ }
  }

  if (!testId) {
    console.warn('[examFlow] No published test found — skipping exam steps');
    // Still logout gracefully
    http.post(`${BASE_URL}/api/auth/logout`, null, {
      headers: authHeaders(token),
      tags: { endpoint: 'login', name: 'POST /api/auth/logout', flow: 'exam' },
    });
    return;
  }

  sleep(jitter(1, 2)); // student browses tests list

  // ── 4. Fetch exam detail + questions ──────────────────────────
  const examRes = http.get(`${BASE_URL}/api/tests/${testId}`, {
    headers: authHeaders(token),
    tags: { endpoint: 'tests', name: `GET /api/tests/:id`, flow: 'exam' },
  });

  const examOk = check(examRes, {
    'exam: test detail 200': (r) => r.status === 200,
    'exam: questions array': (r) => {
      try { return Array.isArray(JSON.parse(r.body)?.data?.test_questions); }
      catch { return false; }
    },
  });

  let questions = [];
  if (examOk) {
    try { questions = JSON.parse(examRes.body)?.data?.test_questions || []; }
    catch { /* no-op */ }
  }

  sleep(jitter(2, 4)); // student reads instructions

  // ── 5. Start attempt ─────────────────────────────────────────
  const startRes = http.post(
    `${BASE_URL}/api/attempts/start`,
    JSON.stringify({ test_id: testId }),
    {
      headers: authHeaders(token),
      tags: { endpoint: 'attempts', name: 'POST /api/attempts/start', flow: 'exam' },
    }
  );

  const startOk = check(startRes, {
    'exam: start attempt 2xx': (r) => r.status === 200 || r.status === 201,
    'exam: attempt id present': (r) => {
      try { return !!JSON.parse(r.body)?.data?.id; }
      catch { return false; }
    },
  });

  if (!startOk) {
    examFail.add(1);
    console.warn(`[examFlow] Start attempt failed — HTTP ${startRes.status}: ${startRes.body.slice(0, 150)}`);
    // Continue to logout
    http.post(`${BASE_URL}/api/auth/logout`, null, {
      headers: authHeaders(token),
      tags: { endpoint: 'login', name: 'POST /api/auth/logout', flow: 'exam' },
    });
    return;
  }
  examStart.add(1);

  let attemptId;
  try { attemptId = JSON.parse(startRes.body)?.data?.id; }
  catch { /* no-op */ }

  if (!attemptId) {
    examFail.add(1);
    return;
  }

  // ── 6. Answer questions (realistic exam pacing) ───────────────
  // Each question: read (think time) → pick answer → save → proceed
  const questionCount = questions.length || (ctx && ctx.questionCount) || 5;
  const questionsToAnswer = Math.min(questionCount, questions.length || questionCount);

  for (let i = 0; i < questionsToAnswer; i++) {
    const q = questions[i];
    const questionId = q ? q.id : null;

    // Think time: 10–45 seconds per question (realistic exam pace)
    const thinkMs = jitter(10, 45);
    sleep(thinkMs);

    if (!questionId) continue;

    // Pick a random MCQ answer (a/b/c/d) or text for others
    const questionType = q?.type || 'mcq';
    let answer;
    if (questionType === 'mcq') {
      const opts = q?.options;
      if (Array.isArray(opts) && opts.length > 0) {
        answer = opts[Math.floor(Math.random() * opts.length)];
      } else {
        answer = String.fromCharCode(97 + Math.floor(Math.random() * 4)); // a/b/c/d
      }
    } else {
      answer = `Answer for question ${i + 1}`;
    }

    const ansRes = http.post(
      `${BASE_URL}/api/attempts/${attemptId}/answer`,
      JSON.stringify({ question_id: questionId, answer }),
      {
        headers: authHeaders(token),
        tags: { endpoint: 'attempts', name: 'POST /api/attempts/:id/answer', flow: 'exam' },
      }
    );

    check(ansRes, {
      'exam: answer saved 2xx': (r) => r.status === 200 || r.status === 201,
    });

    if (ansRes.status === 200 || ansRes.status === 201) {
      answersSaved.add(1);
    }
  }

  sleep(jitter(1, 3)); // student reviews before submitting

  // ── 7. Submit exam ────────────────────────────────────────────
  const submitRes = http.post(
    `${BASE_URL}/api/attempts/${attemptId}/submit`,
    JSON.stringify({}),
    {
      headers: authHeaders(token),
      tags: { endpoint: 'attempts', name: 'POST /api/attempts/:id/submit', flow: 'exam' },
    }
  );

  const submitOk = check(submitRes, {
    'exam: submit 200':       (r) => r.status === 200,
    'exam: score in result':  (r) => {
      try { return typeof JSON.parse(r.body)?.data?.score !== 'undefined'; }
      catch { return false; }
    },
  });

  if (submitOk) {
    submitOK.add(1);
  } else {
    submitFail.add(1);
    console.warn(`[examFlow] Submit failed — HTTP ${submitRes.status}: ${submitRes.body.slice(0, 150)}`);
  }

  sleep(jitter(1, 2)); // student looks at result

  // ── 8. View result ────────────────────────────────────────────
  if (submitOk) {
    http.get(`${BASE_URL}/api/attempts/${attemptId}/result`, {
      headers: authHeaders(token),
      tags: { endpoint: 'attempts', name: 'GET /api/attempts/:id/result', flow: 'exam' },
    });
  }

  sleep(jitter(0.5, 1));

  // ── 9. Logout ─────────────────────────────────────────────────
  http.post(`${BASE_URL}/api/auth/logout`, null, {
    headers: authHeaders(token),
    tags: { endpoint: 'login', name: 'POST /api/auth/logout', flow: 'exam' },
  });

  // Record end-to-end latency for this VU's full exam session
  examLatency.add(Date.now() - vuStart);
}
