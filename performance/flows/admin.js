// performance/flows/admin.js
// Realistic admin journey: dashboard → manage users → batches → analytics →
// attendance → certificates → support tickets.

import { group, sleep } from 'k6';
import { loginUser } from '../helpers/auth.js';
import { apiGet, extractIds } from '../helpers/http.js';
import { pick, thinkTime } from '../helpers/data.js';
import { CREDENTIALS, THINK_TIME_MIN, THINK_TIME_MAX } from '../helpers/config.js';

let _token    = null;
let _batchIds = [];
let _userIds  = [];

export function adminFlow(data) {
  // ── One-time login ─────────────────────────────────────────
  if (!_token) {
    var creds = (data && data.credentials && data.credentials.admin)
      || CREDENTIALS.admin;
    _token = loginUser(creds.email, creds.password);
    if (!_token) { sleep(3); return; }
  }

  if (data && data.resources) {
    if (!_batchIds.length) _batchIds = (data.resources.batchIds || []).slice();
    if (!_userIds.length)  _userIds  = (data.resources.userIds  || []).slice();
  }

  // ── 1. Dashboard / Analytics ──────────────────────────────
  group('admin.dashboard', function() {
    apiGet('/api/analytics/admin', _token);
    sleep(thinkTime(THINK_TIME_MIN, THINK_TIME_MAX));
  });

  // ── 2. Notifications ──────────────────────────────────────
  group('admin.notifications', function() {
    apiGet('/api/notifications/unread/count', _token);
    sleep(0.3);
    apiGet('/api/notifications', _token);
    sleep(thinkTime(0.5, 1.5));
  });

  // ── 3. User management ────────────────────────────────────
  group('admin.users', function() {
    var res = apiGet('/api/users', _token);
    var ids = extractIds(res);
    if (ids.length) {
      ids.forEach(function(id) {
        if (_userIds.indexOf(id) === -1) _userIds.push(id);
      });
    }
    sleep(thinkTime(THINK_TIME_MIN, THINK_TIME_MAX));
  });

  // ── 4. User profile detail ────────────────────────────────
  var userId = pick(_userIds);
  if (userId) {
    group('admin.user-detail', function() {
      apiGet('/api/users/' + userId, _token);
      sleep(thinkTime(0.5, 1.5));
    });
  }

  // ── 5. Courses overview ───────────────────────────────────
  group('admin.courses', function() {
    apiGet('/api/courses', _token);
    sleep(thinkTime(0.5, 1.5));
  });

  // ── 6. Batches ────────────────────────────────────────────
  group('admin.batches', function() {
    var res = apiGet('/api/batches', _token);
    var ids = extractIds(res);
    if (ids.length && !_batchIds.length) _batchIds = ids;
    sleep(thinkTime(THINK_TIME_MIN, THINK_TIME_MAX));
  });

  // ── 7. Batch detail ───────────────────────────────────────
  var batchId = pick(_batchIds);
  if (batchId) {
    group('admin.batch-detail', function() {
      apiGet('/api/batches/' + batchId, _token);
      sleep(thinkTime(0.5, 1));
      apiGet('/api/batches/' + batchId + '/courses', _token);
      sleep(thinkTime(0.5, 1.5));
    });
  }

  // ── 8. Assignments ────────────────────────────────────────
  group('admin.assignments', function() {
    apiGet('/api/assignments', _token);
    sleep(thinkTime(0.5, 1.5));
  });

  // ── 9. Tests ─────────────────────────────────────────────
  group('admin.tests', function() {
    apiGet('/api/tests', _token);
    sleep(thinkTime(0.5, 1));
  });

  // ── 10. Live classes ─────────────────────────────────────
  group('admin.live-classes', function() {
    apiGet('/api/live-classes', _token);
    sleep(thinkTime(0.5, 1));
  });

  // ── 11. Calendar ─────────────────────────────────────────
  group('admin.calendar', function() {
    apiGet('/api/calendar/upcoming', _token);
    sleep(thinkTime(0.5, 1));
  });

  // ── 12. Certificates ─────────────────────────────────────
  group('admin.certificates', function() {
    apiGet('/api/certificates', _token);
    sleep(thinkTime(0.5, 1.5));
  });

  // ── 13. Messages ─────────────────────────────────────────
  group('admin.messages', function() {
    apiGet('/api/messages/unread/count', _token);
    sleep(0.3);
    apiGet('/api/messages', _token);
    sleep(thinkTime(0.5, 1.5));
  });

  // ── 14. Support tickets ───────────────────────────────────
  group('admin.support', function() {
    apiGet('/api/support-tickets', _token);
    sleep(thinkTime(THINK_TIME_MIN, THINK_TIME_MAX));
  });

  // ── 15. Institution info ──────────────────────────────────
  group('admin.institution', function() {
    apiGet('/api/institutions', _token);
    sleep(thinkTime(0.5, 1.5));
  });

  // ── 16. Billing ───────────────────────────────────────────
  group('admin.billing', function() {
    apiGet('/api/billing', _token);
    sleep(thinkTime(0.5, 1.5));
  });

  // ── 17. AI interview questions ────────────────────────────
  group('admin.ai-questions', function() {
    apiGet('/api/ai-questions', _token);
    sleep(thinkTime(0.5, 1));
  });
}
