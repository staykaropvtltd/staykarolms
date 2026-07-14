// performance/flows/faculty.js
// Realistic faculty journey: dashboard → manage courses → grade submissions →
// mark attendance → live classes → messages.

import { group, sleep } from 'k6';
import { loginUser } from '../helpers/auth.js';
import { apiGet, apiPost, extractIds } from '../helpers/http.js';
import { pick, thinkTime } from '../helpers/data.js';
import { CREDENTIALS, THINK_TIME_MIN, THINK_TIME_MAX } from '../helpers/config.js';

let _token     = null;
let _courseIds = [];
let _batchIds  = [];
let _testIds   = [];

export function facultyFlow(data) {
  // ── One-time login ─────────────────────────────────────────
  if (!_token) {
    var creds = (data && data.credentials && data.credentials.faculty)
      || CREDENTIALS.faculty;
    _token = loginUser(creds.email, creds.password);
    if (!_token) { sleep(3); return; }
  }

  if (data && data.resources) {
    if (!_courseIds.length) _courseIds = (data.resources.courseIds || []).slice();
    if (!_batchIds.length)  _batchIds  = (data.resources.batchIds  || []).slice();
    if (!_testIds.length)   _testIds   = (data.resources.testIds   || []).slice();
  }

  // ── 1. Dashboard ──────────────────────────────────────────
  group('faculty.dashboard', function() {
    apiGet('/api/analytics/faculty', _token);
    sleep(thinkTime(THINK_TIME_MIN, THINK_TIME_MAX));
  });

  // ── 2. Notifications ──────────────────────────────────────
  group('faculty.notifications', function() {
    apiGet('/api/notifications/unread/count', _token);
    sleep(0.3);
    apiGet('/api/notifications', _token);
    sleep(thinkTime(0.5, 1.5));
  });

  // ── 3. My courses ─────────────────────────────────────────
  group('faculty.courses', function() {
    var res = apiGet('/api/courses', _token);
    var ids = extractIds(res);
    if (ids.length) {
      ids.forEach(function(id) {
        if (_courseIds.indexOf(id) === -1) _courseIds.push(id);
      });
    }
    sleep(thinkTime(THINK_TIME_MIN, THINK_TIME_MAX));
  });

  // ── 4. Course details + student roster ────────────────────
  var courseId = pick(_courseIds);
  if (courseId) {
    group('faculty.course-management', function() {
      apiGet('/api/courses/' + courseId, _token);
      sleep(thinkTime(0.5, 1));
      apiGet('/api/courses/' + courseId + '/students', _token);
      sleep(thinkTime(0.5, 1.5));
      apiGet('/api/courses/' + courseId + '/content', _token);
      sleep(thinkTime(THINK_TIME_MIN, THINK_TIME_MAX));
    });
  }

  // ── 5. Tests management ───────────────────────────────────
  group('faculty.tests', function() {
    var res = apiGet('/api/tests', _token);
    var ids = extractIds(res);
    if (ids.length && !_testIds.length) _testIds = ids;
    sleep(thinkTime(0.5, 1.5));
  });

  // ── 6. Submissions to grade ───────────────────────────────
  group('faculty.submissions', function() {
    apiGet('/api/submissions?status=pending', _token);
    sleep(thinkTime(0.5, 1));
    apiGet('/api/submissions', _token);
    sleep(thinkTime(THINK_TIME_MIN, THINK_TIME_MAX));
  });

  // ── 7. Attendance records ─────────────────────────────────
  if (courseId) {
    group('faculty.attendance', function() {
      apiGet('/api/attendance/course/' + courseId, _token);
      sleep(thinkTime(THINK_TIME_MIN, THINK_TIME_MAX));
    });
  }

  // ── 8. Assignments ────────────────────────────────────────
  group('faculty.assignments', function() {
    apiGet('/api/assignments', _token);
    sleep(thinkTime(0.5, 1.5));
  });

  // ── 9. Live classes ───────────────────────────────────────
  group('faculty.live-classes', function() {
    apiGet('/api/live-classes', _token);
    sleep(thinkTime(0.5, 1));
  });

  // ── 10. Calendar ─────────────────────────────────────────
  group('faculty.calendar', function() {
    apiGet('/api/calendar/upcoming', _token);
    sleep(thinkTime(0.5, 1));
  });

  // ── 11. Messages ─────────────────────────────────────────
  group('faculty.messages', function() {
    apiGet('/api/messages/unread/count', _token);
    sleep(0.3);
    apiGet('/api/messages', _token);
    sleep(thinkTime(THINK_TIME_MIN, THINK_TIME_MAX));
  });

  // ── 12. AI questions management ───────────────────────────
  group('faculty.ai-questions', function() {
    apiGet('/api/ai-questions', _token);
    sleep(thinkTime(0.5, 1));
  });
}
