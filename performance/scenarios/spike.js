// performance/scenarios/spike.js
// ── Spike Test ────────────────────────────────────────────────
// Simulates a sudden burst of traffic — like all students joining a live
// class at the same moment, or an exam going live.
//
// Pattern: idle (5 VUs) → instant spike to 150 → sustain 4 min
//          → instant drop back → recover
//
// Key questions:
//   • Does the system crash or return errors during the spike?
//   • How long to recover after the spike subsides?
//   • Are any requests queued and eventually served, or dropped?
//
// Run: k6 run -e BASE_URL=... scenarios/spike.js

import { studentFlow } from '../flows/student.js';
import { facultyFlow } from '../flows/faculty.js';
import { loginUser }   from '../helpers/auth.js';
import { discoverResources } from '../helpers/resources.js';
import { CREDENTIALS } from '../helpers/config.js';
import { buildSummary } from '../helpers/summary.js';

export { studentFlow, facultyFlow };

export const options = {
  scenarios: {
    // Students spike hard (exam / class start)
    student_spike: {
      executor: 'ramping-vus',
      exec:     'studentFlow',
      startVUs: 0,
      stages: [
        { duration: '1m',  target: 5   },  // baseline idle
        { duration: '10s', target: 120 },  // SPIKE — class just went live
        { duration: '4m',  target: 120 },  // hold spike
        { duration: '10s', target: 5   },  // instant drop
        { duration: '3m',  target: 5   },  // recovery observation
        { duration: '30s', target: 0   },
      ],
      gracefulRampDown: '30s',
    },
    // Faculty monitors (moderate, no spike)
    faculty_steady: {
      executor: 'ramping-vus',
      exec:     'facultyFlow',
      startVUs: 0,
      stages: [
        { duration: '1m',  target: 3  },
        { duration: '10s', target: 10 },
        { duration: '4m',  target: 10 },
        { duration: '10s', target: 3  },
        { duration: '3m',  target: 3  },
        { duration: '30s', target: 0  },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // During a spike we expect higher latency; we're watching for outright failure
    http_req_failed:   ['rate<0.05'],                // 5% tolerance during spike
    http_req_duration: ['p(95)<8000', 'p(99)<15000'],
    'http_req_duration{endpoint:login}': ['p(95)<5000'],
  },
};

export function setup() {
  var tokens = {};
  if (CREDENTIALS.student.email) tokens.student = loginUser(CREDENTIALS.student.email, CREDENTIALS.student.password);
  if (CREDENTIALS.faculty.email) tokens.faculty = loginUser(CREDENTIALS.faculty.email, CREDENTIALS.faculty.password);

  return {
    tokens:      tokens,
    credentials: CREDENTIALS,
    resources:   discoverResources(tokens),
  };
}

export function handleSummary(data) {
  return buildSummary(data, 'spike');
}
