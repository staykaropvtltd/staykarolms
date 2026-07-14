// performance/helpers/config.js
// Single source of truth for all configuration.
// Every value is read from __ENV (set via -e KEY=VALUE on the k6 CLI).

export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

export const THINK_TIME_MIN = parseFloat(__ENV.THINK_TIME_MIN || '1');
export const THINK_TIME_MAX = parseFloat(__ENV.THINK_TIME_MAX || '3');

export const REPORT_DIR = __ENV.REPORT_DIR || 'reports';

// ── Credentials ──────────────────────────────────────────────
export const CREDENTIALS = {
  student: {
    email:    __ENV.STUDENT_EMAIL    || '',
    password: __ENV.STUDENT_PASSWORD || '',
  },
  faculty: {
    email:    __ENV.FACULTY_EMAIL    || '',
    password: __ENV.FACULTY_PASSWORD || '',
  },
  admin: {
    email:    __ENV.ADMIN_EMAIL    || '',
    password: __ENV.ADMIN_PASSWORD || '',
  },
  superAdmin: {
    email:    __ENV.SUPER_ADMIN_EMAIL    || '',
    password: __ENV.SUPER_ADMIN_PASSWORD || '',
  },
};

// ── Shared thresholds applied to every scenario ───────────────
// Relaxed defaults — individual scenarios override where needed.
export const THRESHOLDS = {
  // Overall SLOs
  http_req_failed:   ['rate<0.01'],               // <1 % errors
  http_req_duration: ['p(95)<2000', 'p(99)<5000'],

  // Per-endpoint SLOs (matched via the `endpoint` tag set in http.js)
  'http_req_duration{endpoint:login}':       ['p(95)<1000'],
  'http_req_duration{endpoint:analytics}':   ['p(95)<3000'],
  'http_req_duration{endpoint:courses}':     ['p(95)<1500'],
  'http_req_duration{endpoint:assignments}': ['p(95)<1500'],
  'http_req_duration{endpoint:tests}':       ['p(95)<1500'],
  'http_req_duration{endpoint:attendance}':  ['p(95)<1500'],
  'http_req_duration{endpoint:messages}':    ['p(95)<1000'],
  'http_req_duration{endpoint:upload}':      ['p(95)<10000'],
  'http_req_duration{endpoint:health}':      ['p(95)<500'],
};

// ── Stage presets ─────────────────────────────────────────────
export const STAGES = {
  baseline: [
    { duration: '3m', target: 1 },
    { duration: '30s', target: 0 },
  ],
  load: [
    { duration: '2m',  target: 10 },  // warm-up
    { duration: '3m',  target: 35 },  // ramp to expected student peak
    { duration: '10m', target: 50 },  // sustain (35 students + 10 faculty + 5 admin)
    { duration: '3m',  target: 0 },   // ramp-down
  ],
  stress: [
    { duration: '2m',  target: 10  },
    { duration: '5m',  target: 50  },
    { duration: '5m',  target: 100 },
    { duration: '5m',  target: 200 },
    { duration: '5m',  target: 200 }, // sustain at 4× expected peak
    { duration: '3m',  target: 0   },
  ],
  spike: [
    { duration: '1m',  target: 5   }, // idle
    { duration: '10s', target: 150 }, // instant spike (class starts)
    { duration: '4m',  target: 150 }, // hold spike
    { duration: '10s', target: 5   }, // instant drop
    { duration: '3m',  target: 5   }, // recover
    { duration: '30s', target: 0   },
  ],
  soak: [
    { duration: '2m',  target: 20 }, // ramp
    { duration: '30m', target: 20 }, // hold at moderate load
    { duration: '2m',  target: 0  }, // ramp-down
  ],
};
