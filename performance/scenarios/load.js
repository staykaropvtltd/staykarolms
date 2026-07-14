// performance/scenarios/load.js
// ── Load Test ─────────────────────────────────────────────────
// Simulates expected peak production traffic for a single institution:
//   ~500 enrolled students, 10% concurrent = 50 active users
//   Traffic split: 70% students / 20% faculty / 10% admin
//
// Stages: 2 min ramp → 3 min ramp to peak → 10 min sustain → 3 min ramp-down
//
// Run: k6 run -e BASE_URL=... -e STUDENT_EMAIL=... scenarios/load.js

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
    student_traffic: {
      executor:  'ramping-vus',
      exec:      'studentFlow',
      startVUs:  0,
      stages: [
        { duration: '2m',  target: 7  },
        { duration: '3m',  target: 35 },
        { duration: '10m', target: 35 },
        { duration: '3m',  target: 0  },
      ],
      gracefulRampDown: '30s',
    },
    faculty_traffic: {
      executor:  'ramping-vus',
      exec:      'facultyFlow',
      startVUs:  0,
      stages: [
        { duration: '2m',  target: 2  },
        { duration: '3m',  target: 10 },
        { duration: '10m', target: 10 },
        { duration: '3m',  target: 0  },
      ],
      gracefulRampDown: '30s',
    },
    admin_traffic: {
      executor:  'ramping-vus',
      exec:      'adminFlow',
      startVUs:  0,
      stages: [
        { duration: '2m',  target: 1 },
        { duration: '3m',  target: 5 },
        { duration: '10m', target: 5 },
        { duration: '3m',  target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    ...THRESHOLDS,
    http_req_duration: ['p(95)<2000', 'p(99)<4000'],
    http_req_failed:   ['rate<0.01'],
  },
};

export function setup() {
  var tokens = {};
  if (CREDENTIALS.student.email)   tokens.student   = loginUser(CREDENTIALS.student.email, CREDENTIALS.student.password);
  if (CREDENTIALS.faculty.email)   tokens.faculty   = loginUser(CREDENTIALS.faculty.email, CREDENTIALS.faculty.password);
  if (CREDENTIALS.admin.email)     tokens.admin     = loginUser(CREDENTIALS.admin.email,   CREDENTIALS.admin.password);

  return {
    tokens:      tokens,
    credentials: CREDENTIALS,
    resources:   discoverResources(tokens),
  };
}

export function handleSummary(data) {
  return buildSummary(data, 'load');
}
