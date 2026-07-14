// performance/scenarios/soak.js
// ── Soak Test ─────────────────────────────────────────────────
// Moderate load sustained for 30+ minutes.
// Catches issues that only appear over time:
//   • Memory leaks (heap grows, eventually OOM)
//   • Connection pool exhaustion (DB connections pile up)
//   • Supabase token expiry mid-test (tokens last 1h — covered at 30 min)
//   • Log file growth / disk saturation
//   • Gradual latency creep from cache thrashing
//
// VU count: 20 (14 students / 4 faculty / 2 admin) — ~40% of expected peak
//
// Run: k6 run -e BASE_URL=... scenarios/soak.js

import { studentFlow } from '../flows/student.js';
import { facultyFlow } from '../flows/faculty.js';
import { adminFlow }   from '../flows/admin.js';
import { loginUser }   from '../helpers/auth.js';
import { discoverResources } from '../helpers/resources.js';
import { CREDENTIALS, THRESHOLDS } from '../helpers/config.js';
import { buildSummary } from '../helpers/summary.js';

export { studentFlow, facultyFlow, adminFlow };

export const options = {
  scenarios: {
    student_soak: {
      executor: 'ramping-vus',
      exec:     'studentFlow',
      startVUs: 0,
      stages: [
        { duration: '2m',  target: 14 },
        { duration: '30m', target: 14 },
        { duration: '2m',  target: 0  },
      ],
      gracefulRampDown: '60s',
    },
    faculty_soak: {
      executor: 'ramping-vus',
      exec:     'facultyFlow',
      startVUs: 0,
      stages: [
        { duration: '2m',  target: 4 },
        { duration: '30m', target: 4 },
        { duration: '2m',  target: 0 },
      ],
      gracefulRampDown: '60s',
    },
    admin_soak: {
      executor: 'ramping-vus',
      exec:     'adminFlow',
      startVUs: 0,
      stages: [
        { duration: '2m',  target: 2 },
        { duration: '30m', target: 2 },
        { duration: '2m',  target: 0 },
      ],
      gracefulRampDown: '60s',
    },
  },
  thresholds: {
    ...THRESHOLDS,
    // Soak must maintain load-test SLOs throughout — any creep is a leak
    http_req_failed:   ['rate<0.01'],
    http_req_duration: ['p(95)<2000', 'p(99)<4000'],
  },
};

export function setup() {
  var tokens = {};
  if (CREDENTIALS.student.email) tokens.student = loginUser(CREDENTIALS.student.email, CREDENTIALS.student.password);
  if (CREDENTIALS.faculty.email) tokens.faculty = loginUser(CREDENTIALS.faculty.email, CREDENTIALS.faculty.password);
  if (CREDENTIALS.admin.email)   tokens.admin   = loginUser(CREDENTIALS.admin.email,   CREDENTIALS.admin.password);

  return {
    tokens:      tokens,
    credentials: CREDENTIALS,
    resources:   discoverResources(tokens),
  };
}

export function handleSummary(data) {
  return buildSummary(data, 'soak');
}
