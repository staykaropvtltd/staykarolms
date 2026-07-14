// performance/scenarios/stress.js
// ── Stress Test ───────────────────────────────────────────────
// Ramps beyond expected capacity to find the breaking point.
// Starts at normal load, doubles, then quadruples peak.
// Watch for: error rate spike, latency degradation, 429 rate-limit errors.
//
// Total VUs at peak: 200 (140 students / 40 faculty / 20 admin)
//
// Run: k6 run -e BASE_URL=... scenarios/stress.js

import { studentFlow } from '../flows/student.js';
import { facultyFlow } from '../flows/faculty.js';
import { adminFlow }   from '../flows/admin.js';
import { loginUser }   from '../helpers/auth.js';
import { discoverResources } from '../helpers/resources.js';
import { CREDENTIALS } from '../helpers/config.js';
import { buildSummary } from '../helpers/summary.js';

export { studentFlow, facultyFlow, adminFlow };

export const options = {
  scenarios: {
    student_stress: {
      executor: 'ramping-vus',
      exec:     'studentFlow',
      startVUs: 0,
      stages: [
        { duration: '2m',  target: 10  },  // normal
        { duration: '5m',  target: 35  },  // expected peak
        { duration: '5m',  target: 70  },  // 2× peak
        { duration: '5m',  target: 140 },  // 4× peak
        { duration: '5m',  target: 140 },  // sustain breaking point
        { duration: '3m',  target: 0   },  // recovery
      ],
      gracefulRampDown: '60s',
    },
    faculty_stress: {
      executor: 'ramping-vus',
      exec:     'facultyFlow',
      startVUs: 0,
      stages: [
        { duration: '2m',  target: 3  },
        { duration: '5m',  target: 10 },
        { duration: '5m',  target: 20 },
        { duration: '5m',  target: 40 },
        { duration: '5m',  target: 40 },
        { duration: '3m',  target: 0  },
      ],
      gracefulRampDown: '60s',
    },
    admin_stress: {
      executor: 'ramping-vus',
      exec:     'adminFlow',
      startVUs: 0,
      stages: [
        { duration: '2m',  target: 1  },
        { duration: '5m',  target: 5  },
        { duration: '5m',  target: 10 },
        { duration: '5m',  target: 20 },
        { duration: '5m',  target: 20 },
        { duration: '3m',  target: 0  },
      ],
      gracefulRampDown: '60s',
    },
  },
  // Relaxed thresholds — stress tests are expected to breach SLOs;
  // we're measuring WHERE and HOW MUCH, not pass/fail.
  thresholds: {
    http_req_failed:   ['rate<0.10'],               // alert at 10% errors
    http_req_duration: ['p(95)<5000', 'p(99)<10000'],
    'http_req_duration{endpoint:login}':      ['p(95)<3000'],
    'http_req_duration{endpoint:analytics}':  ['p(95)<10000'],
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
  return buildSummary(data, 'stress');
}
