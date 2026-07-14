// performance/flows/student.js
// Realistic student journey: dashboard → courses → content → assignments →
// tests → notifications → messages → AI interview → certificates.
//
// Each VU logs in once and holds its JWT for the entire test run.

import { group, sleep } from 'k6';
import { loginUser } from '../helpers/auth.js';
import { apiGet, apiPost, extractIds } from '../helpers/http.js';
import { pick, thinkTime, aiSessionPayload } from '../helpers/data.js';
import { CREDENTIALS, THINK_TIME_MIN, THINK_TIME_MAX } from '../helpers/config.js';

// Per-VU state (k6 module instances are isolated per VU)
let _token     = null;
let _studentId = null;
let _courseIds = [];
let _testIds   = [];
let _assignIds = [];

export function studentFlow(data) {
  // ── One-time login per VU ─────────────────────────────────
  if (!_token) {
    var creds = (data && data.credentials && data.credentials.student)
      || CREDENTIALS.student;
    _token = loginUser(creds.email, creds.password);
    if (!_token) { sleep(3); return; }
  }

  // ── Seed IDs from setup data (first iteration only) ───────
  if (data && data.resources) {
    if (!_courseIds.length) _courseIds = (data.resources.courseIds || []).slice();
    if (!_testIds.length)   _testIds   = (data.resources.testIds   || []).slice();
    if (!_assignIds.length) _assignIds = (data.resources.assignmentIds || []).slice();
  }
  if (!_studentId && data && data.resources && data.resources.studentMe) {
    _studentId = data.resources.studentMe.id;
  }

  // ── 1. Dashboard (analytics) ──────────────────────────────
  group('student.dashboard', function() {
    apiGet('/api/analytics/student', _token);
    sleep(thinkTime(THINK_TIME_MIN, THINK_TIME_MAX));
  });

  // ── 2. Notifications check ────────────────────────────────
  group('student.notifications', function() {
    apiGet('/api/notifications/unread/count', _token);
    sleep(0.3);
    apiGet('/api/notifications', _token);
    sleep(thinkTime(0.5, 1.5));
  });

  // ── 3. Browse & enroll courses ────────────────────────────
  group('student.courses', function() {
    var res = apiGet('/api/courses', _token);
    var ids = extractIds(res);
    if (ids.length) {
      // Merge any freshly discovered IDs
      ids.forEach(function(id) {
        if (_courseIds.indexOf(id) === -1) _courseIds.push(id);
      });
    }
    sleep(thinkTime(THINK_TIME_MIN, THINK_TIME_MAX));
  });

  // ── 4. View a specific course ─────────────────────────────
  var courseId = pick(_courseIds);
  if (courseId) {
    group('student.course-detail', function() {
      apiGet('/api/courses/' + courseId, _token);
      sleep(thinkTime(0.5, 1.5));
      apiGet('/api/courses/' + courseId + '/content', _token);
      sleep(thinkTime(0.5, 1.5));
      apiGet('/api/courses/' + courseId + '/completions', _token);
      sleep(thinkTime(THINK_TIME_MIN, THINK_TIME_MAX));
    });
  }

  // ── 5. Assignments ────────────────────────────────────────
  group('student.assignments', function() {
    var res = apiGet('/api/assignments', _token);
    var ids = extractIds(res);
    if (ids.length && !_assignIds.length) _assignIds = ids;
    sleep(thinkTime(THINK_TIME_MIN, THINK_TIME_MAX));
  });

  // ── 6. Tests ──────────────────────────────────────────────
  group('student.tests', function() {
    var res = apiGet('/api/tests', _token);
    var ids = extractIds(res);
    if (ids.length && !_testIds.length) _testIds = ids;
    sleep(thinkTime(THINK_TIME_MIN, THINK_TIME_MAX));
  });

  // ── 7. My submissions ─────────────────────────────────────
  group('student.submissions', function() {
    apiGet('/api/submissions/student', _token);
    sleep(thinkTime(0.5, 1.5));
  });

  // ── 8. Attendance (own record) ────────────────────────────
  if (_studentId) {
    group('student.attendance', function() {
      apiGet('/api/attendance/student/' + _studentId, _token);
      sleep(thinkTime(0.5, 1.5));
    });
  }

  // ── 9. Calendar ───────────────────────────────────────────
  group('student.calendar', function() {
    apiGet('/api/calendar/upcoming', _token);
    sleep(thinkTime(0.5, 1));
  });

  // ── 10. Messages ──────────────────────────────────────────
  group('student.messages', function() {
    apiGet('/api/messages/unread/count', _token);
    sleep(0.3);
    apiGet('/api/messages', _token);
    sleep(thinkTime(THINK_TIME_MIN, THINK_TIME_MAX));
  });

  // ── 11. AI interview sessions ─────────────────────────────
  group('student.ai-sessions', function() {
    apiGet('/api/ai-sessions', _token);
    sleep(thinkTime(0.5, 1));
    // Simulate creating a new session ~20% of the time
    if (Math.random() < 0.2) {
      apiPost('/api/ai-sessions', aiSessionPayload(), _token);
      sleep(thinkTime(1, 2));
    }
  });

  // ── 12. AI interview questions ────────────────────────────
  group('student.ai-questions', function() {
    apiGet('/api/ai-questions', _token);
    sleep(thinkTime(0.5, 1));
  });

  // ── 13. Certificates ──────────────────────────────────────
  group('student.certificates', function() {
    apiGet('/api/certificates', _token);
    sleep(thinkTime(0.5, 1.5));
  });

  // ── 14. Live classes (active) ─────────────────────────────
  group('student.live-classes', function() {
    apiGet('/api/live-classes/active', _token);
    sleep(thinkTime(0.5, 1));
  });

  // ── 15. Support tickets ───────────────────────────────────
  group('student.support', function() {
    apiGet('/api/support-tickets', _token);
    sleep(thinkTime(0.5, 1.5));
  });
}
