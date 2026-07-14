// performance/scenarios/baseline.js
// ── Baseline ──────────────────────────────────────────────────
// 1 VU, 3 minutes.
// Walks every single API endpoint once to:
//   • Confirm all routes are reachable
//   • Capture cold-start latency with zero concurrent load
//   • Establish baseline numbers for comparison
//
// Run: k6 run -e BASE_URL=http://localhost:3001 \
//              -e STUDENT_EMAIL=... -e STUDENT_PASSWORD=... \
//              -e FACULTY_EMAIL=... -e FACULTY_PASSWORD=... \
//              -e ADMIN_EMAIL=...   -e ADMIN_PASSWORD=... \
//              scenarios/baseline.js

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { loginUser } from '../helpers/auth.js';
import { apiGet, apiPost } from '../helpers/http.js';
import { BASE_URL, CREDENTIALS, THRESHOLDS, REPORT_DIR } from '../helpers/config.js';
import { discoverResources } from '../helpers/resources.js';
import { buildSummary } from '../helpers/summary.js';

export const options = {
  vus: 1,
  duration: '4m',
  thresholds: {
    http_req_failed: ['rate<0.05'],      // Relaxed: some endpoints may 404 without data
    http_req_duration: ['p(95)<5000'],   // No SLO pressure — measuring baselines
    'http_req_duration{endpoint:health}': ['p(95)<500'],
    'http_req_duration{endpoint:login}':  ['p(95)<2000'],
  },
};

export function setup() {
  var tokens = {};

  // Login each role — failures are non-fatal (credentials may not be set)
  if (CREDENTIALS.student.email) {
    tokens.student = loginUser(CREDENTIALS.student.email, CREDENTIALS.student.password);
  }
  if (CREDENTIALS.faculty.email) {
    tokens.faculty = loginUser(CREDENTIALS.faculty.email, CREDENTIALS.faculty.password);
  }
  if (CREDENTIALS.admin.email) {
    tokens.admin = loginUser(CREDENTIALS.admin.email, CREDENTIALS.admin.password);
  }

  var resources = discoverResources(tokens);

  return {
    tokens: tokens,
    credentials: CREDENTIALS,
    resources: resources,
  };
}

export default function(data) {
  var t  = data.tokens || {};
  var ts = t.student;
  var tf = t.faculty;
  var ta = t.admin;
  var r  = data.resources || {};
  var c0 = r.courseIds    && r.courseIds[0];
  var b0 = r.batchIds     && r.batchIds[0];
  var te = r.testIds      && r.testIds[0];
  var a0 = r.assignmentIds && r.assignmentIds[0];
  var u0 = r.userIds      && r.userIds[0];
  var sid = r.studentMe   && r.studentMe.id;

  // ── 1. Health ────────────────────────────────────────────
  group('health', function() {
    var res = http.get(BASE_URL + '/api/health', { tags: { endpoint: 'health', name: '/api/health' } });
    check(res, { 'health 200': function(r) { return r.status === 200; } });
    sleep(0.3);
  });

  // ── 2. Auth ──────────────────────────────────────────────
  group('auth', function() {
    if (ts) { apiGet('/api/auth/me', ts); sleep(0.3); }
  });

  // ── 3. Analytics (all roles) ─────────────────────────────
  group('analytics', function() {
    if (ts) { apiGet('/api/analytics/student', ts); sleep(0.5); }
    if (tf) { apiGet('/api/analytics/faculty', tf); sleep(0.5); }
    if (ta) { apiGet('/api/analytics/admin',   ta); sleep(0.5); }
  });

  // ── 4. Courses ───────────────────────────────────────────
  group('courses', function() {
    if (ts) { apiGet('/api/courses', ts); sleep(0.3); }
    if (c0 && (ts || ta)) {
      apiGet('/api/courses/' + c0, ts || ta); sleep(0.3);
      apiGet('/api/courses/' + c0 + '/content', ts || ta); sleep(0.3);
      apiGet('/api/courses/' + c0 + '/modules', ta || tf); sleep(0.3);
      if (ta || tf) { apiGet('/api/courses/' + c0 + '/students', ta || tf); sleep(0.3); }
      if (ts) { apiGet('/api/courses/' + c0 + '/completions', ts); sleep(0.3); }
    }
  });

  // ── 5. Batches ───────────────────────────────────────────
  group('batches', function() {
    if (ta) {
      apiGet('/api/batches', ta); sleep(0.3);
      if (b0) {
        apiGet('/api/batches/' + b0, ta); sleep(0.3);
        apiGet('/api/batches/' + b0 + '/courses', ta); sleep(0.3);
      }
    }
  });

  // ── 6. Tests ─────────────────────────────────────────────
  group('tests', function() {
    if (ts) { apiGet('/api/tests', ts); sleep(0.3); }
    if (te && (ts || ta)) { apiGet('/api/tests/' + te, ts || ta); sleep(0.3); }
  });

  // ── 7. Assignments ───────────────────────────────────────
  group('assignments', function() {
    if (ts) { apiGet('/api/assignments', ts); sleep(0.3); }
    if (a0 && (ts || ta)) { apiGet('/api/assignments/' + a0, ts || ta); sleep(0.3); }
  });

  // ── 8. Submissions ───────────────────────────────────────
  group('submissions', function() {
    if (tf) { apiGet('/api/submissions',         tf); sleep(0.3); }
    if (tf) { apiGet('/api/submissions?status=pending', tf); sleep(0.3); }
    if (ts) { apiGet('/api/submissions/student', ts); sleep(0.3); }
  });

  // ── 9. Attendance ────────────────────────────────────────
  group('attendance', function() {
    if (sid && ts) { apiGet('/api/attendance/student/' + sid, ts); sleep(0.3); }
    if (c0 && (tf || ta)) { apiGet('/api/attendance/course/' + c0, tf || ta); sleep(0.3); }
  });

  // ── 10. Notifications ────────────────────────────────────
  group('notifications', function() {
    if (ts) {
      apiGet('/api/notifications/unread/count', ts); sleep(0.2);
      apiGet('/api/notifications', ts); sleep(0.3);
      apiGet('/api/notifications/history', ts); sleep(0.3);
    }
  });

  // ── 11. Messages ─────────────────────────────────────────
  group('messages', function() {
    if (ts) {
      apiGet('/api/messages/unread/count', ts); sleep(0.2);
      apiGet('/api/messages', ts); sleep(0.3);
    }
  });

  // ── 12. Calendar ─────────────────────────────────────────
  group('calendar', function() {
    if (ts) {
      apiGet('/api/calendar/upcoming', ts); sleep(0.3);
      apiGet('/api/calendar', ts); sleep(0.3);
    }
  });

  // ── 13. Live classes ─────────────────────────────────────
  group('live-classes', function() {
    if (ta) { apiGet('/api/live-classes', ta); sleep(0.3); }
    if (ts) { apiGet('/api/live-classes/active', ts); sleep(0.3); }
  });

  // ── 14. AI sessions ──────────────────────────────────────
  group('ai-sessions', function() {
    if (ts) { apiGet('/api/ai-sessions', ts); sleep(0.3); }
  });

  // ── 15. AI questions ─────────────────────────────────────
  group('ai-questions', function() {
    if (ta) { apiGet('/api/ai-questions', ta); sleep(0.3); }
  });

  // ── 16. Certificates ─────────────────────────────────────
  group('certificates', function() {
    if (ts) { apiGet('/api/certificates', ts); sleep(0.3); }
  });

  // ── 17. Support tickets ───────────────────────────────────
  group('support-tickets', function() {
    if (ts) { apiGet('/api/support-tickets', ts); sleep(0.3); }
  });

  // ── 18. Users ────────────────────────────────────────────
  group('users', function() {
    if (ta) {
      apiGet('/api/users', ta); sleep(0.3);
      if (u0) { apiGet('/api/users/' + u0, ta); sleep(0.3); }
    }
  });

  // ── 19. Institutions ─────────────────────────────────────
  group('institutions', function() {
    if (ta) { apiGet('/api/institutions', ta); sleep(0.3); }
  });

  // ── 20. Billing ──────────────────────────────────────────
  group('billing', function() {
    if (ta) { apiGet('/api/billing', ta); sleep(0.3); }
  });

  sleep(2);
}

export function handleSummary(data) {
  return buildSummary(data, 'baseline');
}
