// performance/scenarios/exam-capacity.js
// Focused capacity test: 300 → 400 → 500 → 600 → 750 → 1000 → 1200 → 1500 concurrent exam students.
//
// Targets (ALL must hold at every stage for that stage to pass):
//   - http_req_failed  < 1%   (zero lost answers / submissions tolerated)
//   - http_req_duration p95   < 2 000 ms
//   - http_req_duration p99   < 5 000 ms
//
// The test aborts immediately when the error-rate threshold is breached for
// 30+ consecutive seconds — so the output tells you EXACTLY which stage broke first.
// Reliable capacity = the last stage that passed WITHOUT triggering the abort.
//
// Usage (Windows PowerShell):
//   k6 run -e BASE_URL=https://staykarolmsbackend.vercel.app `
//           -e STUDENT_EMAIL=student@college.edu `
//           -e STUDENT_PASSWORD=TestE2E@2024 `
//           -e REPORT_DIR=performance/reports `
//           performance\scenarios\exam-capacity.js

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import {
  examFlow,
  examStarts, examStartFail,
  answersSaved, answerBatchOK, answerBatchFail,
  submitOK, submitFail,
  examE2E,
} from '../flows/examFlow.js';
import { BASE_URL } from '../helpers/config.js';

// ── Test options ──────────────────────────────────────────────
export const options = {
  stages: [
    // Warm-up — prime Redis cache and Vercel cold-start pool
    { duration: '30s', target: 10 },
    { duration: '30s', target: 10 },

    // Stage 1: 300 VUs (2 min sustain — last known clean baseline)
    { duration: '30s', target: 300 },
    { duration: '2m',  target: 300 },

    // Stage 2: 400 VUs
    { duration: '30s', target: 400 },
    { duration: '2m',  target: 400 },

    // Stage 3: 500 VUs
    { duration: '30s', target: 500 },
    { duration: '2m',  target: 500 },

    // Stage 4: 600 VUs
    { duration: '30s', target: 600 },
    { duration: '2m',  target: 600 },

    // Stage 5: 750 VUs
    { duration: '30s', target: 750 },
    { duration: '2m',  target: 750 },

    // Stage 6: 1000 VUs
    { duration: '30s', target: 1000 },
    { duration: '2m',  target: 1000 },

    // Stage 7: 1200 VUs (20% above 1000 — first stretch target)
    { duration: '30s', target: 1200 },
    { duration: '2m',  target: 1200 },

    // Stage 8: 1500 VUs (production 6PM–10PM peak target)
    { duration: '30s', target: 1500 },
    { duration: '3m',  target: 1500 },

    // Cool-down
    { duration: '1m',  target: 0 },
  ],

  thresholds: {
    // PRIMARY SLO — abort if breached for 30+ consecutive seconds.
    // This pinpoints the exact stage that breaks the capacity target.
    'http_req_failed': [{
      threshold:       'rate<0.01',
      abortOnFail:     true,
      delayAbortEval:  '30s',
    }],

    // Latency SLOs — fail the run but do NOT abort (let it finish to collect
    // per-stage data even if p95 slips at high VU counts).
    'http_req_duration': ['p(95)<2000', 'p(99)<5000'],

    // Per-endpoint SLOs (informational; do not abort)
    'http_req_duration{endpoint:analytics}':    ['p(95)<3000'],
    'http_req_duration{endpoint:tests}':        ['p(95)<2000'],
    'http_req_duration{endpoint:attempts}':     ['p(95)<2000'],
    'http_req_duration{endpoint:notifications}':['p(95)<2000'],
  },

  noConnectionReuse: false,
  userAgent: 'StayKaro-CapacityTest/3.0',
  tags: { scenario: 'exam_capacity' },
};

// ── Setup: login ONCE, discover test and questions ────────────
export function setup() {
  const email    = __ENV.STUDENT_EMAIL    || '';
  const password = __ENV.STUDENT_PASSWORD || '';

  if (!email || !password) {
    fail('[setup] FATAL: STUDENT_EMAIL and STUDENT_PASSWORD must be set.');
  }

  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (loginRes.status !== 200) {
    fail(`[setup] FATAL: Login failed — HTTP ${loginRes.status}: ${loginRes.body.slice(0, 200)}`);
  }

  let token;
  try { token = JSON.parse(loginRes.body).data.session.access_token; }
  catch { fail('[setup] FATAL: Cannot parse token from login response'); }

  console.log(`[setup] Login OK — token: ${token.slice(0, 20)}...`);

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  const testsRes = http.get(`${BASE_URL}/api/tests?status=published`, { headers });
  if (testsRes.status !== 200) {
    fail(`[setup] FATAL: Tests endpoint returned HTTP ${testsRes.status}`);
  }

  let tests = [];
  try { tests = JSON.parse(testsRes.body)?.data || []; }
  catch (e) { fail(`[setup] FATAL: Cannot parse tests: ${e}`); }

  console.log(`[setup] Published tests: ${tests.length}`);

  const FALLBACK_TEST_ID = '77be748f-fd5a-49eb-b8fb-a61c8917c5ba';
  let testId;
  if (tests.length === 0) {
    console.warn(`[setup] Empty test list — using fallback ID: ${FALLBACK_TEST_ID}`);
    testId = FALLBACK_TEST_ID;
  } else {
    const preferred = tests.find(t => t.title === 'Load Test Exam — MCQ Practice') || tests[0];
    testId = preferred.id;
    console.log(`[setup] Test: "${preferred.title}" (${testId})`);
  }

  let questions = [];
  const detailRes = http.get(`${BASE_URL}/api/tests/${testId}`, { headers });
  if (detailRes.status === 200) {
    try { questions = JSON.parse(detailRes.body)?.data?.test_questions || []; }
    catch { console.warn('[setup] Could not parse test questions'); }
  }
  console.log(`[setup] Questions: ${questions.length}`);

  return { token, testId, questions };
}

// ── VU function ───────────────────────────────────────────────
export default function (data) {
  examFlow(data);
}

// ── Summary report ────────────────────────────────────────────
export function handleSummary(data) {
  const ts  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = (__ENV.REPORT_DIR || 'performance/reports').replace(/\/$/, '');
  const m   = data.metrics;

  const val   = (metric, key) => metric?.values?.[key] != null
    ? Number(metric.values[key]).toFixed(key === 'rate' ? 4 : 0)
    : 'N/A';
  const count = (metric) => metric?.values?.count ?? 0;

  const failRatePct = m.http_req_failed
    ? (m.http_req_failed.values.rate * 100).toFixed(3)
    : 'N/A';
  const p95      = val(m.http_req_duration, 'p(95)');
  const p99      = val(m.http_req_duration, 'p(99)');
  const avg      = val(m.http_req_duration, 'avg');
  const rps      = m.http_reqs?.values?.rate != null
    ? Number(m.http_reqs.values.rate).toFixed(2) : 'N/A';
  const total    = count(m.http_reqs);
  const starts   = count(m.exam_starts_ok);
  const sFail    = count(m.exam_starts_fail);
  const answers  = count(m.exam_answers_saved);
  const batchOK  = count(m.exam_answer_batch_ok);
  const batchFail = count(m.exam_answer_batch_fail);
  const submits  = count(m.exam_submits_ok);
  const subFail  = count(m.exam_submits_fail);
  const e2eP95   = val(m.exam_e2e_ms, 'p(95)');
  const e2eAvg   = val(m.exam_e2e_ms, 'avg');

  const testsP95 = val(m['http_req_duration{endpoint:tests}'],         'p(95)');
  const attP95   = val(m['http_req_duration{endpoint:attempts}'],       'p(95)');
  const dashP95  = val(m['http_req_duration{endpoint:analytics}'],      'p(95)');
  const notifP95 = val(m['http_req_duration{endpoint:notifications}'],  'p(95)');

  const pass  = (v, threshold) => parseInt(v) <= threshold;
  const badge = (v, threshold) => pass(v, threshold)
    ? '<span style="background:#14532d;color:#22c55e;padding:.15rem .5rem;border-radius:999px;font-size:.75rem">PASS</span>'
    : '<span style="background:#450a0a;color:#ef4444;padding:.15rem .5rem;border-radius:999px;font-size:.75rem">FAIL</span>';
  const color = (v, threshold) => pass(v, threshold) ? '#22c55e' : '#ef4444';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Exam Capacity Test — ${ts}</title>
<style>
  *{box-sizing:border-box}
  body{background:#0f1117;color:#e2e8f0;font-family:system-ui,sans-serif;margin:0;padding:2rem;line-height:1.5}
  h1{color:#f6c90e;margin-bottom:4px;font-size:1.5rem}
  h2{color:#64748b;font-size:.875rem;font-weight:400;margin:0 0 1.5rem}
  h3{color:#94a3b8;font-size:1rem;margin:0 0 .75rem}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin:1rem 0}
  .card{background:#1a1f2e;border:1px solid #2d3748;border-radius:12px;padding:1.2rem}
  .label{color:#475569;font-size:.7rem;text-transform:uppercase;letter-spacing:.06em}
  .value{font-size:1.75rem;font-weight:700;margin:.2rem 0}
  .sub{color:#475569;font-size:.78rem}
  table{width:100%;border-collapse:collapse;font-size:.875rem}
  th{background:#1a1f2e;color:#64748b;padding:.5rem .8rem;text-align:left;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em}
  td{padding:.6rem .8rem;border-bottom:1px solid #1a1f2e}
  .section{background:#1a1f2e;border:1px solid #2d3748;border-radius:12px;padding:1.25rem;margin:1rem 0}
  .note{background:#1a1f2e;border-left:3px solid #f97316;padding:.75rem 1rem;border-radius:0 8px 8px 0;font-size:.85rem;color:#94a3b8;margin:1rem 0}
  .ok{color:#22c55e} .fail{color:#ef4444}
</style>
</head>
<body>
<h1>StayKaro LMS — Exam Capacity Test</h1>
<h2>300 → 400 → 500 → 600 → 750 → 1000 → 1200 → 1500 VUs &nbsp;·&nbsp; ${ts}</h2>

<div class="grid">
  <div class="card">
    <div class="label">Total HTTP Requests</div>
    <div class="value" style="color:#f6c90e">${total.toLocaleString()}</div>
    <div class="sub">${rps} req/s sustained avg</div>
  </div>
  <div class="card">
    <div class="label">Error Rate</div>
    <div class="value" style="color:${color(parseFloat(failRatePct) * 10, 10)}">${failRatePct}%</div>
    <div class="sub">SLO: &lt; 1.000% (strict)</div>
  </div>
  <div class="card">
    <div class="label">Overall p95 Latency</div>
    <div class="value" style="color:${color(p95, 2000)}">${p95} ms</div>
    <div class="sub">avg: ${avg} ms &nbsp;·&nbsp; p99: ${p99} ms</div>
  </div>
  <div class="card">
    <div class="label">Exam Session p95</div>
    <div class="value" style="color:#a78bfa">${e2eP95} ms</div>
    <div class="sub">avg session: ${e2eAvg} ms</div>
  </div>
</div>

<div class="section">
  <h3>Exam Pipeline Funnel</h3>
  <div class="grid" style="grid-template-columns:repeat(5,1fr)">
    <div class="card">
      <div class="label">Exam Starts</div>
      <div class="value" style="color:#22c55e">${starts.toLocaleString()}</div>
      <div class="sub">Failed: <span class="${sFail > 0 ? 'fail' : 'ok'}">${sFail}</span></div>
    </div>
    <div class="card">
      <div class="label">Answer Batches OK</div>
      <div class="value" style="color:#38bdf8">${batchOK.toLocaleString()}</div>
      <div class="sub">Failed: <span class="${batchFail > 0 ? 'fail' : 'ok'}">${batchFail}</span></div>
    </div>
    <div class="card">
      <div class="label">Answers Saved</div>
      <div class="value" style="color:#38bdf8">${answers.toLocaleString()}</div>
      <div class="sub">individual answer writes</div>
    </div>
    <div class="card">
      <div class="label">Submits OK</div>
      <div class="value" style="color:#22c55e">${submits.toLocaleString()}</div>
      <div class="sub">Failed: <span class="${subFail > 0 ? 'fail' : 'ok'}">${subFail}</span></div>
    </div>
    <div class="card">
      <div class="label">Submit Rate</div>
      <div class="value" style="color:#f6c90e">${starts > 0 ? ((submits / starts) * 100).toFixed(1) : 'N/A'}%</div>
      <div class="sub">of started exams</div>
    </div>
  </div>
</div>

<div class="section">
  <h3>Endpoint Latency vs SLO</h3>
  <table>
    <thead><tr><th>Endpoint</th><th>p95</th><th>SLO</th><th>Status</th></tr></thead>
    <tbody>
      <tr><td>Dashboard (analytics)</td><td>${dashP95} ms</td><td>&lt; 3000 ms</td><td>${badge(dashP95, 3000)}</td></tr>
      <tr><td>Notifications count</td><td>${notifP95} ms</td><td>&lt; 2000 ms</td><td>${badge(notifP95, 2000)}</td></tr>
      <tr><td>Tests / Exam questions</td><td>${testsP95} ms</td><td>&lt; 2000 ms</td><td>${badge(testsP95, 2000)}</td></tr>
      <tr><td>Attempts (start / batch-answers / submit)</td><td>${attP95} ms</td><td>&lt; 2000 ms</td><td>${badge(attP95, 2000)}</td></tr>
    </tbody>
  </table>
</div>

<div class="note">
  <strong>Methodology:</strong> All VUs share one student token (login happens once in setup()).
  Answer saves use the new <code>POST /api/attempts/:id/answers</code> batch endpoint — 1 HTTP call
  per exam instead of N (one per question). Think time (8–30 s per question) is preserved so
  session duration is realistic. The error-rate threshold aborts the test on 30+ s breach, so
  the last passing stage is the verified reliable capacity.
</div>

</body>
</html>`;

  return {
    [`${dir}/capacity-${ts}.html`]: html,
    [`${dir}/capacity-${ts}.json`]: JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
  };
}
