// performance/helpers/resources.js
// Shared setup helper: discovers live resource IDs from the API
// so test flows can use real UUIDs instead of hard-coded values.
// Call from setup() in each scenario file.

import http from 'k6/http';
import { BASE_URL } from './config.js';

function authH(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function fetchIds(token, path, idField) {
  idField = idField || 'id';
  try {
    const res = http.get(`${BASE_URL}${path}`, { headers: authH(token) });
    if (res.status !== 200) return [];
    const body = JSON.parse(res.body);
    const rows = Array.isArray(body.data) ? body.data : [];
    return rows.slice(0, 5).map(function(r) { return r[idField]; }).filter(Boolean);
  } catch (e) {
    console.warn(`[resources] Failed to fetch ${path}: ${e}`);
    return [];
  }
}

function fetchMe(token) {
  try {
    const res = http.get(`${BASE_URL}/api/auth/me`, { headers: authH(token) });
    if (res.status !== 200) return null;
    return JSON.parse(res.body).data || null;
  } catch {
    return null;
  }
}

/**
 * Discovers resource IDs and user profiles for each role.
 * Returned object is JSON-serializable and passed to every VU via setup().
 */
export function discoverResources(tokens) {
  var courseIds     = [];
  var batchIds      = [];
  var testIds       = [];
  var assignmentIds = [];
  var userIds       = [];
  var studentMe     = null;
  var facultyMe     = null;
  var adminMe       = null;

  var adminTok   = tokens.admin;
  var studentTok = tokens.student;
  var facultyTok = tokens.faculty;

  if (adminTok) {
    courseIds     = fetchIds(adminTok, '/api/courses');
    batchIds      = fetchIds(adminTok, '/api/batches');
    testIds       = fetchIds(adminTok, '/api/tests');
    assignmentIds = fetchIds(adminTok, '/api/assignments');
    userIds       = fetchIds(adminTok, '/api/users');
    adminMe       = fetchMe(adminTok);
  }
  if (studentTok) studentMe = fetchMe(studentTok);
  if (facultyTok) facultyMe = fetchMe(facultyTok);

  return {
    courseIds:     courseIds,
    batchIds:      batchIds,
    testIds:       testIds,
    assignmentIds: assignmentIds,
    userIds:       userIds,
    studentMe:     studentMe,
    facultyMe:     facultyMe,
    adminMe:       adminMe,
  };
}
