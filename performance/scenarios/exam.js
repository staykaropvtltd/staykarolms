// performance/scenarios/exam.js
// Incremental exam load test: 25 → 50 → 100 → 200 → 300 → 500 → 750 → 1000 VUs
// Each stage holds for 2 minutes before stepping up.
// Test stops reporting "PASS" when error rate > 1% or p95 > 2s.
//
// Usage:
//   k6 run --out json=reports/exam-raw.json \
//     -e BASE_URL=https://staykarolmsbackend.vercel.app \
//     -e STUDENT_EMAIL=student@college.edu \
//     -e STUDENT_PASSWORD=TestE2E@2024 \
//     performance/scenarios/exam.js

import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { examFlow, loginOK, loginFail, examStart, examFail, answersSaved, submitOK, submitFail, examLatency } from '../flows/examFlow.js';
import { BASE_URL } from '../helpers/config.js';

// ── Test options ──────────────────────────────────────────────
export const options = {
  // Incremental ramp: 25 → 50 → 100 → 200 → 300 → 500 → 750 → 1000 VUs
  // 2-min sustain per level, 30-s ramps between levels.
  stages: [
    // Warm-up
    { duration: '30s', target: 5   },
    { duration: '30s', target: 25  },  // Stage 1:  25 VUs
    { duration: '2m',  target: 25  },
    { duration: '30s', target: 50  },  // Stage 2:  50 VUs
    { duration: '2m',  target: 50  },
    { duration: '30s', target: 100 },  // Stage 3: 100 VUs
    { duration: '2m',  target: 100 },
    { duration: '30s', target: 200 },  // Stage 4: 200 VUs
    { duration: '2m',  target: 200 },
    { duration: '30s', target: 300 },  // Stage 5: 300 VUs
    { duration: '2m',  target: 300 },
    { duration: '30s', target: 500 },  // Stage 6: 500 VUs
    { duration: '2m',  target: 500 },
    { duration: '30s', target: 750 },  // Stage 7: 750 VUs
    { duration: '2m',  target: 750 },
    { duration: '30s', target: 1000 }, // Stage 8: 1000 VUs
    { duration: '2m',  target: 1000 },
    // Cool-down
    { duration: '1m',  target: 0   },
  ],

  // Thresholds — test is PASS only if ALL are met
  thresholds: {
    // Global SLOs
    http_req_failed:                           ['rate<0.01'],   // < 1% error rate
    http_req_duration:                         ['p(95)<2000', 'p(99)<5000'],

    // Exam-specific endpoint SLOs
    'http_req_duration{endpoint:login}':       ['p(95)<3000'],  // login is expensive (Supabase auth)
    'http_req_duration{endpoint:tests}':       ['p(95)<1500'],  // exam questions fetch
    'http_req_duration{endpoint:attempts}':    ['p(95)<2000'],  // answer save + submit
    'http_req_duration{endpoint:analytics}':   ['p(95)<3000'],  // dashboard
    'http_req_duration{endpoint:notifications}': ['p(95)<1000'],

    // Business metrics — exam pipeline must not fail
    'exam_logins_fail':   ['count<10'],   // < 10 total login failures across entire run
    'exam_starts_fail':   ['count<10'],   // < 10 exam start failures
    'exam_submits_fail':  ['count<10'],   // < 10 submission failures
  },

  // Respect Vercel/Supabase rate limits: limit new connections per second
  // to avoid triggering 429s that skew the latency measurements.
  noConnectionReuse: false,
  userAgent: 'StayKaro-ExamStressTest/2.0',

  // Tag all metrics with scenario name for filtering in dashboards
  tags: { scenario: 'exam_incremental' },
};

// ── Setup: discover a published test once ─────────────────────
export function setup() {
  const email    = __ENV.STUDENT_EMAIL    || '';
  const password = __ENV.STUDENT_PASSWORD || '';

  // Login
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (loginRes.status !== 200) {
    console.error(`[setup] Login failed — HTTP ${loginRes.status}: ${loginRes.body.slice(0, 200)}`);
    return { testId: null, questionCount: 0 };
  }

  let token;
  try { token = JSON.parse(loginRes.body).data.session.access_token; }
  catch {
    console.error('[setup] Could not parse token');
    return { testId: null, questionCount: 0 };
  }

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  // Get published tests
  const testsRes = http.get(`${BASE_URL}/api/tests?status=published`, { headers });
  let testId      = null;
  let questionCount = 0;

  if (testsRes.status === 200) {
    try {
      const tests = JSON.parse(testsRes.body)?.data || [];
      console.log(`[setup] Found ${tests.length} published tests`);
      if (tests.length > 0) {
        testId = tests[0].id;

        // Fetch full test to know question count
        const detailRes = http.get(`${BASE_URL}/api/tests/${testId}`, { headers });
        if (detailRes.status === 200) {
          const qs = JSON.parse(detailRes.body)?.data?.test_questions || [];
          questionCount = qs.length;
          console.log(`[setup] Test "${tests[0].title}" — ${questionCount} questions (id: ${testId})`);
        }
      }
    } catch (e) {
      console.warn('[setup] Could not parse tests list:', e);
    }
  } else {
    console.warn(`[setup] Tests list failed — HTTP ${testsRes.status}`);
  }

  // Logout setup user
  http.post(`${BASE_URL}/api/auth/logout`, null, { headers });

  return { testId, questionCount };
}

// ── VU function ───────────────────────────────────────────────
export default function (data) {
  examFlow(data);
}

// ── Summary report ────────────────────────────────────────────
export function handleSummary(data) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = (__ENV.REPORT_DIR || 'performance/reports').replace(/\/$/, '');

  // Extract key metrics
  const m        = data.metrics;
  const failRate = m.http_req_failed  ? (m.http_req_failed.values.rate * 100).toFixed(2)  : 'N/A';
  const p95      = m.http_req_duration ? m.http_req_duration.values['p(95)'].toFixed(0)   : 'N/A';
  const p99      = m.http_req_duration ? m.http_req_duration.values['p(99)'].toFixed(0)   : 'N/A';
  const rps      = m.http_reqs        ? m.http_reqs.values.rate.toFixed(2)                : 'N/A';
  const total    = m.http_reqs        ? m.http_reqs.values.count                          : 0;
  const logins   = m.exam_logins_ok   ? m.exam_logins_ok.values.count                    : 0;
  const starts   = m.exam_starts_ok   ? m.exam_starts_ok.values.count                    : 0;
  const answers  = m.exam_answers_saved ? m.exam_answers_saved.values.count              : 0;
  const submits  = m.exam_submits_ok  ? m.exam_submits_ok.values.count                   : 0;
  const lFail    = m.exam_logins_fail ? m.exam_logins_fail.values.count                  : 0;
  const sFail    = m.exam_submits_fail ? m.exam_submits_fail.values.count                : 0;
  const e2eP95   = m.exam_e2e_latency_ms ? m.exam_e2e_latency_ms.values['p(95)'].toFixed(0) : 'N/A';

  const loginP95   = m['http_req_duration{endpoint:login}']    ? m['http_req_duration{endpoint:login}'].values['p(95)'].toFixed(0)    : 'N/A';
  const testsP95   = m['http_req_duration{endpoint:tests}']    ? m['http_req_duration{endpoint:tests}'].values['p(95)'].toFixed(0)    : 'N/A';
  const attemptsP95 = m['http_req_duration{endpoint:attempts}'] ? m['http_req_duration{endpoint:attempts}'].values['p(95)'].toFixed(0) : 'N/A';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Exam Load Test Report — ${ts}</title>
<style>
  body{background:#0f1117;color:#e2e8f0;font-family:system-ui,sans-serif;margin:0;padding:2rem}
  h1{color:#f6c90e;margin-bottom:0.25rem}
  h2{color:#94a3b8;font-size:1rem;font-weight:400;margin-top:0}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin:1.5rem 0}
  .card{background:#1e2433;border-radius:12px;padding:1.25rem;border:1px solid #2d3748}
  .card .label{color:#64748b;font-size:0.75rem;text-transform:uppercase;letter-spacing:.05em}
  .card .value{font-size:1.75rem;font-weight:700;color:#f6c90e;margin:.25rem 0}
  .card .sub{font-size:0.8rem;color:#64748b}
  .pass{color:#22c55e!important}.fail{color:#ef4444!important}.warn{color:#f97316!important}
  table{width:100%;border-collapse:collapse;margin:1rem 0}
  th{background:#1e2433;color:#94a3b8;padding:.6rem .9rem;text-align:left;font-size:.8rem;text-transform:uppercase}
  td{padding:.6rem .9rem;border-bottom:1px solid #1e2433;font-size:.875rem}
  tr:hover td{background:#1e2433}
  .badge{display:inline-block;padding:.15rem .5rem;border-radius:999px;font-size:.7rem;font-weight:600}
  .badge-pass{background:#14532d;color:#22c55e}.badge-fail{background:#450a0a;color:#ef4444}
  .badge-warn{background:#431407;color:#f97316}
  .section{background:#1e2433;border-radius:12px;padding:1.5rem;margin:1rem 0;border:1px solid #2d3748}
</style>
</head>
<body>
<h1>StayKaro LMS — Exam Load Test Report</h1>
<h2>Incremental: 25 → 50 → 100 → 200 → 300 → 500 → 750 → 1000 VUs &nbsp;|&nbsp; Generated: ${ts}</h2>

<div class="grid">
  <div class="card">
    <div class="label">Total Requests</div>
    <div class="value">${total.toLocaleString()}</div>
    <div class="sub">${rps} req/s avg</div>
  </div>
  <div class="card">
    <div class="label">Error Rate</div>
    <div class="value ${parseFloat(failRate) < 1 ? 'pass' : 'fail'}">${failRate}%</div>
    <div class="sub">threshold: &lt; 1%</div>
  </div>
  <div class="card">
    <div class="label">Overall p95</div>
    <div class="value ${parseInt(p95) < 2000 ? 'pass' : 'fail'}">${p95} ms</div>
    <div class="sub">p99: ${p99} ms</div>
  </div>
  <div class="card">
    <div class="label">Exam E2E p95</div>
    <div class="value">${e2eP95} ms</div>
    <div class="sub">full session latency</div>
  </div>
</div>

<div class="grid">
  <div class="card">
    <div class="label">Successful Logins</div>
    <div class="value pass">${logins.toLocaleString()}</div>
    <div class="sub">Failed: <span class="${lFail > 0 ? 'fail' : 'pass'}">${lFail}</span></div>
  </div>
  <div class="card">
    <div class="label">Exam Starts</div>
    <div class="value pass">${starts.toLocaleString()}</div>
    <div class="sub">Failed: <span class="${examFail > 0 ? 'fail' : 'pass'}">${m.exam_starts_fail ? m.exam_starts_fail.values.count : 0}</span></div>
  </div>
  <div class="card">
    <div class="label">Answers Saved</div>
    <div class="value">${answers.toLocaleString()}</div>
    <div class="sub">write operations</div>
  </div>
  <div class="card">
    <div class="label">Successful Submits</div>
    <div class="value pass">${submits.toLocaleString()}</div>
    <div class="sub">Failed: <span class="${sFail > 0 ? 'fail' : 'pass'}">${sFail}</span></div>
  </div>
</div>

<div class="section">
  <h3 style="color:#f6c90e;margin-top:0">Endpoint Latency Breakdown</h3>
  <table>
    <thead>
      <tr><th>Endpoint</th><th>p95</th><th>SLO</th><th>Status</th></tr>
    </thead>
    <tbody>
      <tr><td>Login</td><td>${loginP95} ms</td><td>&lt; 3000 ms</td><td><span class="badge ${parseInt(loginP95) < 3000 ? 'badge-pass' : 'badge-fail'}">${parseInt(loginP95) < 3000 ? 'PASS' : 'FAIL'}</span></td></tr>
      <tr><td>Test Questions Fetch</td><td>${testsP95} ms</td><td>&lt; 1500 ms</td><td><span class="badge ${parseInt(testsP95) < 1500 ? 'badge-pass' : 'badge-fail'}">${parseInt(testsP95) < 1500 ? 'PASS' : 'FAIL'}</span></td></tr>
      <tr><td>Attempts (start/answer/submit)</td><td>${attemptsP95} ms</td><td>&lt; 2000 ms</td><td><span class="badge ${parseInt(attemptsP95) < 2000 ? 'badge-pass' : 'badge-fail'}">${parseInt(attemptsP95) < 2000 ? 'PASS' : 'FAIL'}</span></td></tr>
    </tbody>
  </table>
</div>

<div class="section">
  <h3 style="color:#f6c90e;margin-top:0">Exam Pipeline Funnel</h3>
  <table>
    <thead>
      <tr><th>Step</th><th>Success</th><th>Failed</th><th>Conversion</th></tr>
    </thead>
    <tbody>
      <tr><td>1. Login</td><td class="pass">${logins}</td><td class="${lFail > 0 ? 'fail' : ''}">${lFail}</td><td>${logins + lFail > 0 ? ((logins / (logins + lFail)) * 100).toFixed(1) : 'N/A'}%</td></tr>
      <tr><td>2. Exam Start</td><td class="pass">${starts}</td><td class="${m.exam_starts_fail ? 'fail' : ''}">${m.exam_starts_fail ? m.exam_starts_fail.values.count : 0}</td><td>${logins > 0 ? ((starts / logins) * 100).toFixed(1) : 'N/A'}%</td></tr>
      <tr><td>3. Answers Saved</td><td class="pass">${answers}</td><td>—</td><td>—</td></tr>
      <tr><td>4. Submission</td><td class="pass">${submits}</td><td class="${sFail > 0 ? 'fail' : ''}">${sFail}</td><td>${starts > 0 ? ((submits / starts) * 100).toFixed(1) : 'N/A'}%</td></tr>
    </tbody>
  </table>
</div>

</body>
</html>`;

  return {
    [`${dir}/exam-${ts}.html`]: html,
    [`${dir}/exam-${ts}.json`]: JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
  };
}
