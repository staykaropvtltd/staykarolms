// performance/scenarios/exam.js
// Incremental online exam load test: 25 → 50 → 100 → 200 → 300 → 500 → 750 → 1000 concurrent students.
//
// Design:
//   - setup() logs in ONCE and shares the token with all VUs (avoids auth rate limit)
//   - Each VU simulates one student's exam session
//   - Think time is realistic (8–30 s per question) so VUs stay active long enough
//   - Test auto-stops on threshold breach (k6 marks as FAIL and exits with code 99)
//
// Usage (Windows PowerShell):
//   k6 run -e BASE_URL=https://staykarolmsbackend.vercel.app `
//           -e STUDENT_EMAIL=student@college.edu `
//           -e STUDENT_PASSWORD=TestE2E@2024 `
//           -e REPORT_DIR=performance/reports `
//           performance\scenarios\exam.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import {
  examFlow,
  examStarts, examStartFail,
  answersSaved,
  submitOK, submitFail,
  examE2E,
} from '../flows/examFlow.js';
import { BASE_URL } from '../helpers/config.js';

// ── Test options ──────────────────────────────────────────────
export const options = {
  stages: [
    // Warm-up
    { duration: '30s', target: 5   },
    { duration: '30s', target: 5   },

    // Stage 1: 25 VUs — 2 min sustain
    { duration: '30s', target: 25  },
    { duration: '2m',  target: 25  },

    // Stage 2: 50 VUs
    { duration: '30s', target: 50  },
    { duration: '2m',  target: 50  },

    // Stage 3: 100 VUs
    { duration: '30s', target: 100 },
    { duration: '2m',  target: 100 },

    // Stage 4: 200 VUs
    { duration: '30s', target: 200 },
    { duration: '2m',  target: 200 },

    // Stage 5: 300 VUs
    { duration: '30s', target: 300 },
    { duration: '2m',  target: 300 },

    // Stage 6: 500 VUs
    { duration: '30s', target: 500 },
    { duration: '2m',  target: 500 },

    // Stage 7: 750 VUs
    { duration: '30s', target: 750 },
    { duration: '2m',  target: 750 },

    // Stage 8: 1000 VUs
    { duration: '30s', target: 1000 },
    { duration: '2m',  target: 1000 },

    // Cool-down
    { duration: '1m',  target: 0   },
  ],

  thresholds: {
    // Global SLOs — test FAILS (exit 99) if these are breached
    http_req_failed:    ['rate<0.05'],           // < 5% errors (relaxed for 1000 VU burst)
    http_req_duration:  ['p(95)<3000', 'p(99)<8000'],

    // Per-endpoint SLOs
    'http_req_duration{endpoint:analytics}':    ['p(95)<4000'],
    'http_req_duration{endpoint:tests}':        ['p(95)<2000'],
    'http_req_duration{endpoint:attempts}':     ['p(95)<3000'],
    'http_req_duration{endpoint:notifications}':['p(95)<2000'],
  },

  noConnectionReuse: false,
  userAgent: 'StayKaro-ExamTest/2.0',
  tags: { scenario: 'exam_incremental' },
};

// ── Setup: login ONCE, discover test and questions ────────────
export function setup() {
  const email    = __ENV.STUDENT_EMAIL    || '';
  const password = __ENV.STUDENT_PASSWORD || '';

  if (!email || !password) {
    console.error('[setup] STUDENT_EMAIL and STUDENT_PASSWORD must be set');
    return { token: null, testId: null, questions: [] };
  }

  // Single login for the entire test run
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (loginRes.status !== 200) {
    console.error(`[setup] Login failed — HTTP ${loginRes.status}: ${loginRes.body.slice(0, 200)}`);
    return { token: null, testId: null, questions: [] };
  }

  let token;
  try { token = JSON.parse(loginRes.body).data.session.access_token; }
  catch {
    console.error('[setup] Cannot parse token from login response');
    return { token: null, testId: null, questions: [] };
  }

  console.log(`[setup] Login OK — token: ${token.slice(0, 20)}...`);

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  // Discover published tests
  const testsRes = http.get(`${BASE_URL}/api/tests?status=published`, { headers });
  let testId    = null;
  let questions = [];

  if (testsRes.status === 200) {
    try {
      const tests = JSON.parse(testsRes.body)?.data || [];
      console.log(`[setup] Published tests found: ${tests.length}`);

      if (tests.length > 0) {
        testId = tests[0].id;
        const title = tests[0].title || '(untitled)';
        console.log(`[setup] Using test: "${title}" (${testId})`);

        // Fetch full test with questions
        const detailRes = http.get(`${BASE_URL}/api/tests/${testId}`, { headers });
        if (detailRes.status === 200) {
          const qs = JSON.parse(detailRes.body)?.data?.test_questions || [];
          questions = qs;
          console.log(`[setup] Questions: ${qs.length}`);
        }
      } else {
        console.warn('[setup] No published tests — VUs will test dashboard+list only');
      }
    } catch (e) {
      console.warn(`[setup] Could not parse tests: ${e}`);
    }
  } else {
    console.warn(`[setup] Tests endpoint returned HTTP ${testsRes.status}`);
  }

  return { token, testId, questions };
}

// ── VU function ───────────────────────────────────────────────
export default function (data) {
  examFlow(data);
}

// ── Summary report ────────────────────────────────────────────
export function handleSummary(data) {
  const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir  = (__ENV.REPORT_DIR || 'performance/reports').replace(/\/$/, '');
  const m    = data.metrics;

  const failRate  = m.http_req_failed     ? (m.http_req_failed.values.rate * 100).toFixed(2) : 'N/A';
  const p95       = m.http_req_duration   ? m.http_req_duration.values['p(95)'].toFixed(0)   : 'N/A';
  const p99       = m.http_req_duration   ? m.http_req_duration.values['p(99)'].toFixed(0)   : 'N/A';
  const avg       = m.http_req_duration   ? m.http_req_duration.values.avg.toFixed(0)        : 'N/A';
  const rps       = m.http_reqs          ? m.http_reqs.values.rate.toFixed(2)                : 'N/A';
  const total     = m.http_reqs          ? m.http_reqs.values.count                          : 0;
  const starts    = m.exam_starts_ok     ? m.exam_starts_ok.values.count                     : 0;
  const sFail     = m.exam_starts_fail   ? m.exam_starts_fail.values.count                   : 0;
  const answers   = m.exam_answers_saved ? m.exam_answers_saved.values.count                 : 0;
  const submits   = m.exam_submits_ok    ? m.exam_submits_ok.values.count                    : 0;
  const subFail   = m.exam_submits_fail  ? m.exam_submits_fail.values.count                  : 0;
  const e2eP95    = m.exam_e2e_ms       ? m.exam_e2e_ms.values['p(95)'].toFixed(0)           : 'N/A';
  const e2eAvg    = m.exam_e2e_ms       ? m.exam_e2e_ms.values.avg.toFixed(0)                : 'N/A';

  const testsP95  = m['http_req_duration{endpoint:tests}']    ? m['http_req_duration{endpoint:tests}'].values['p(95)'].toFixed(0)    : 'N/A';
  const attP95    = m['http_req_duration{endpoint:attempts}'] ? m['http_req_duration{endpoint:attempts}'].values['p(95)'].toFixed(0) : 'N/A';
  const dashP95   = m['http_req_duration{endpoint:analytics}']? m['http_req_duration{endpoint:analytics}'].values['p(95)'].toFixed(0): 'N/A';
  const notifP95  = m['http_req_duration{endpoint:notifications}'] ? m['http_req_duration{endpoint:notifications}'].values['p(95)'].toFixed(0) : 'N/A';

  const passColor   = (v, threshold) => parseInt(v) <= threshold ? '#22c55e' : '#ef4444';
  const statusBadge = (v, threshold) => parseInt(v) <= threshold
    ? '<span style="background:#14532d;color:#22c55e;padding:.15rem .5rem;border-radius:999px;font-size:.75rem">PASS</span>'
    : '<span style="background:#450a0a;color:#ef4444;padding:.15rem .5rem;border-radius:999px;font-size:.75rem">FAIL</span>';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Exam Load Test — ${ts}</title>
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
</style>
</head>
<body>
<h1>StayKaro LMS — Exam Load Test Report</h1>
<h2>Incremental 25 → 50 → 100 → 200 → 300 → 500 → 750 → 1000 VUs &nbsp;·&nbsp; ${ts}</h2>

<div class="grid">
  <div class="card">
    <div class="label">Total HTTP Requests</div>
    <div class="value" style="color:#f6c90e">${total.toLocaleString()}</div>
    <div class="sub">${rps} req/s sustained avg</div>
  </div>
  <div class="card">
    <div class="label">Error Rate</div>
    <div class="value" style="color:${passColor(failRate, 5)}">${failRate}%</div>
    <div class="sub">SLO threshold: &lt; 5%</div>
  </div>
  <div class="card">
    <div class="label">Overall p95 Latency</div>
    <div class="value" style="color:${passColor(p95, 3000)}">${p95} ms</div>
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
  <div class="grid" style="grid-template-columns:repeat(4,1fr)">
    <div class="card">
      <div class="label">Exam Starts</div>
      <div class="value" style="color:#22c55e">${starts.toLocaleString()}</div>
      <div class="sub">Failed: <span style="color:${sFail > 0 ? '#ef4444' : '#22c55e'}">${sFail}</span></div>
    </div>
    <div class="card">
      <div class="label">Answers Saved</div>
      <div class="value" style="color:#38bdf8">${answers.toLocaleString()}</div>
      <div class="sub">write ops</div>
    </div>
    <div class="card">
      <div class="label">Submits OK</div>
      <div class="value" style="color:#22c55e">${submits.toLocaleString()}</div>
      <div class="sub">Failed: <span style="color:${subFail > 0 ? '#ef4444' : '#22c55e'}">${subFail}</span></div>
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
      <tr><td>Dashboard (analytics)</td><td>${dashP95} ms</td><td>&lt; 4000 ms</td><td>${statusBadge(dashP95, 4000)}</td></tr>
      <tr><td>Notifications count</td><td>${notifP95} ms</td><td>&lt; 2000 ms</td><td>${statusBadge(notifP95, 2000)}</td></tr>
      <tr><td>Tests / Exam questions</td><td>${testsP95} ms</td><td>&lt; 2000 ms</td><td>${statusBadge(testsP95, 2000)}</td></tr>
      <tr><td>Attempts (start/answer/submit)</td><td>${attP95} ms</td><td>&lt; 3000 ms</td><td>${statusBadge(attP95, 3000)}</td></tr>
    </tbody>
  </table>
</div>

<div class="note">
  <strong>Note on test methodology:</strong> All VUs share a single student token (logged in once during setup) to avoid
  hitting the 15-logins/15-min auth rate limiter. This accurately tests infrastructure throughput — auth
  scalability must be tested separately after raising the limit or adding per-user rate limiting.
</div>

</body>
</html>`;

  return {
    [`${dir}/exam-${ts}.html`]: html,
    [`${dir}/exam-${ts}.json`]: JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
  };
}
