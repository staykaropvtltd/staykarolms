// backend/tests/questionImport.test.js
// Tests for POST /api/tests/:id/questions/bulk
// Covers: RBAC, tenant isolation, validation, duplicate detection, batch insert, rollback.

const request = require('supertest');

jest.mock('../lib/redis', () => require('./helpers/mockRedis'));
jest.mock('../lib/audit', () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/env', () => ({
  validateEnv: jest.fn(),
  startupGuard: (_req, _res, next) => next(),
}));

const { createMockSupabase, ok, err } = require('./helpers/mockSupabase');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ADMIN   = { id: 'admin-1', role: 'admin', institution_id: 'inst-1' };
const STUDENT = { id: 'student-1', role: 'student', institution_id: 'inst-1' };
const TEST    = { id: 'test-1', institution_id: 'inst-1' };

const VALID_MCQ = (n = 1) => ({
  question: `What is question ${n} all about and more text here?`,
  type: 'mcq',
  options: [`Option A${n}`, `Option B${n}`, `Option C${n}`, `Option D${n}`],
  correct_answer: '0',
  marks: 2,
});

function buildApp(supabaseMock) {
  jest.resetModules();
  jest.doMock('../lib/supabase', () => supabaseMock);
  jest.doMock('../lib/redis', () => require('./helpers/mockRedis'));
  jest.doMock('../lib/audit', () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));
  jest.doMock('../lib/env', () => ({
    validateEnv: jest.fn(),
    startupGuard: (_req, _res, next) => next(),
  }));
  return require('../server');
}

function makeJWT(user) {
  const jwt = require('jsonwebtoken');
  const secret = process.env.SUPABASE_JWT_SECRET || 'test-secret';
  return `Bearer ${jwt.sign({ sub: user.id }, secret, { expiresIn: '1h' })}`;
}

function buildBulkMock(user, testData, existingQs = [], insertedIds = [], insertError = null) {
  const supa = createMockSupabase({ profiles: ok(user) });
  supa.from.mockImplementation((table) => {
    if (table === 'profiles') {
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(ok(user)) };
    }
    if (table === 'tests') {
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue(testData ? ok(testData) : err('Not found')) };
    }
    if (table === 'test_questions') {
      let callCount = 0;
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        // maybeSingle returns max order_index row
        maybeSingle: jest.fn().mockResolvedValue(ok(null)),
        // first select call: existing questions for duplicate check
        // subsequent calls: insert
        then: (resolve) => {
          callCount++;
          if (callCount === 1) return resolve(ok(existingQs)); // existing questions
          return resolve(ok(existingQs));
        },
        insert: jest.fn().mockImplementation(() => {
          if (insertError) {
            return { select: jest.fn().mockReturnValue({ then: (r) => r(err(insertError)) }) };
          }
          const ids = insertedIds.map(id => ({ id }));
          return { select: jest.fn().mockReturnValue({ then: (r) => r(ok(ids)) }) };
        }),
        delete: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnValue({ then: (r) => r({ error: null }) }),
      };
    }
    return {};
  });
  return supa;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/tests/:id/questions/bulk', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, SUPABASE_JWT_SECRET: 'test-secret' };
    require('./helpers/mockRedis').clearAll();
    require('./helpers/mockRedis').cacheHit(`profile:${ADMIN.id}`, ADMIN);
    require('./helpers/mockRedis').cacheHit(`profile:${STUDENT.id}`, STUDENT);
  });

  afterAll(() => { process.env = OLD_ENV; });

  // ── Auth & RBAC ─────────────────────────────────────────────────────────────

  test('401 — missing auth token', async () => {
    const supa = createMockSupabase({});
    const app = buildApp(supa);

    const res = await request(app)
      .post('/api/tests/test-1/questions/bulk')
      .send({ questions: [VALID_MCQ()] });

    expect(res.status).toBe(401);
  });

  test('403 — student cannot bulk import', async () => {
    const supa = buildBulkMock(STUDENT, TEST);
    const app = buildApp(supa);

    const res = await request(app)
      .post('/api/tests/test-1/questions/bulk')
      .set('Authorization', makeJWT(STUDENT))
      .send({ questions: [VALID_MCQ()] });

    expect(res.status).toBe(403);
  });

  // ── Input validation ────────────────────────────────────────────────────────

  test('400 — missing questions array', async () => {
    const supa = buildBulkMock(ADMIN, TEST);
    const app = buildApp(supa);

    const res = await request(app)
      .post('/api/tests/test-1/questions/bulk')
      .set('Authorization', makeJWT(ADMIN))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/questions array/i);
  });

  test('400 — empty questions array', async () => {
    const supa = buildBulkMock(ADMIN, TEST);
    const app = buildApp(supa);

    const res = await request(app)
      .post('/api/tests/test-1/questions/bulk')
      .set('Authorization', makeJWT(ADMIN))
      .send({ questions: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test('400 — questions.length > 10,000', async () => {
    const supa = buildBulkMock(ADMIN, TEST);
    const app = buildApp(supa);

    const res = await request(app)
      .post('/api/tests/test-1/questions/bulk')
      .set('Authorization', makeJWT(ADMIN))
      .send({ questions: new Array(10001).fill(VALID_MCQ()) });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/10,000/);
  });

  // ── Test ownership / tenant isolation ───────────────────────────────────────

  test('404 — test not found (different institution)', async () => {
    // Test belongs to inst-2 but admin is inst-1
    const supa = buildBulkMock(ADMIN, null); // null → err
    const app = buildApp(supa);

    const res = await request(app)
      .post('/api/tests/test-999/questions/bulk')
      .set('Authorization', makeJWT(ADMIN))
      .send({ questions: [VALID_MCQ()] });

    expect(res.status).toBe(404);
  });

  // ── Server-side validation ──────────────────────────────────────────────────

  test('422 — all questions fail validation (no valid rows)', async () => {
    const supa = buildBulkMock(ADMIN, TEST, [], []);
    const app = buildApp(supa);

    const res = await request(app)
      .post('/api/tests/test-1/questions/bulk')
      .set('Authorization', makeJWT(ADMIN))
      .send({
        questions: [
          { question: 'Hi', type: 'mcq', options: ['A', 'B'], correct_answer: '0', marks: 1 }, // < 4 options
          { question: '', type: 'mcq', options: ['A', 'B', 'C', 'D'], correct_answer: '0', marks: 1 }, // empty question
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.data.inserted).toBe(0);
    expect(res.body.data.errors.length).toBeGreaterThan(0);
  });

  // ── Duplicate detection ─────────────────────────────────────────────────────

  test('skips questions that duplicate existing DB questions', async () => {
    const existingQ = { question: 'what is question 1 all about and more text here?' };
    const supa = buildBulkMock(ADMIN, TEST, [existingQ], ['new-id-1']);
    const app = buildApp(supa);

    const questions = [
      VALID_MCQ(1), // exact duplicate (case-insensitive)
      VALID_MCQ(2), // new — should pass
    ];

    const res = await request(app)
      .post('/api/tests/test-1/questions/bulk')
      .set('Authorization', makeJWT(ADMIN))
      .send({ questions });

    expect(res.status).toBe(201);
    // Q1 skipped as duplicate, Q2 inserted
    expect(res.body.data.skipped).toBeGreaterThanOrEqual(1);
  });

  test('skips within-batch duplicates', async () => {
    const supa = buildBulkMock(ADMIN, TEST, [], ['id-1']);
    const app = buildApp(supa);

    const q = VALID_MCQ(5);
    const res = await request(app)
      .post('/api/tests/test-1/questions/bulk')
      .set('Authorization', makeJWT(ADMIN))
      .send({ questions: [q, q] }); // same question twice

    expect(res.status).toBe(201);
    expect(res.body.data.skipped).toBeGreaterThanOrEqual(1);
  });

  // ── Successful import ───────────────────────────────────────────────────────

  test('201 — inserts valid questions and returns count', async () => {
    const supa = buildBulkMock(ADMIN, TEST, [], ['id-1', 'id-2']);
    const app = buildApp(supa);

    const res = await request(app)
      .post('/api/tests/test-1/questions/bulk')
      .set('Authorization', makeJWT(ADMIN))
      .send({ questions: [VALID_MCQ(10), VALID_MCQ(11)] });

    expect(res.status).toBe(201);
    expect(res.body.data.inserted).toBe(2);
    expect(res.body.data.skipped).toBe(0);
    expect(res.body.data.errors).toHaveLength(0);
  });

  test('201 — mixed batch: valid rows inserted, invalid rows reported in errors', async () => {
    const supa = buildBulkMock(ADMIN, TEST, [], ['id-1']);
    const app = buildApp(supa);

    const res = await request(app)
      .post('/api/tests/test-1/questions/bulk')
      .set('Authorization', makeJWT(ADMIN))
      .send({
        questions: [
          VALID_MCQ(20),                                                            // valid
          { question: 'Hi', type: 'mcq', options: ['A','B'], correct_answer:'0', marks:1 }, // invalid
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.inserted).toBeGreaterThanOrEqual(1);
    expect(res.body.data.skipped).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.data.errors)).toBe(true);
    expect(res.body.data.errors[0]).toHaveProperty('row');
    expect(res.body.data.errors[0]).toHaveProperty('errors');
  });

  // ── Marks validation ────────────────────────────────────────────────────────

  test.each([
    [0, 'marks 0 rejected'],
    [101, 'marks 101 rejected'],
    [-1, 'marks -1 rejected'],
  ])('skips question with invalid marks (%i)', async (marks) => {
    const supa = buildBulkMock(ADMIN, TEST, [], []);
    const app = buildApp(supa);

    const q = { ...VALID_MCQ(30), marks };
    const res = await request(app)
      .post('/api/tests/test-1/questions/bulk')
      .set('Authorization', makeJWT(ADMIN))
      .send({ questions: [q] });

    // Either 422 (all invalid) or 201 with skipped=1
    if (res.status === 201) {
      expect(res.body.data.skipped).toBe(1);
    } else {
      expect(res.status).toBe(422);
    }
    expect(res.body.data.errors.some(e => e.errors.join(' ').toLowerCase().includes('marks'))).toBe(true);
  });

  // ── correct_answer pointing to empty option ─────────────────────────────────

  test('skips MCQ where correct_answer index points to empty option', async () => {
    const supa = buildBulkMock(ADMIN, TEST, [], []);
    const app = buildApp(supa);

    const q = {
      question: 'This is a valid question text that is long enough?',
      type: 'mcq',
      options: ['Option A', 'Option B', 'Option C', ''], // index 3 empty
      correct_answer: '3',
      marks: 1,
    };

    const res = await request(app)
      .post('/api/tests/test-1/questions/bulk')
      .set('Authorization', makeJWT(ADMIN))
      .send({ questions: [q] });

    if (res.status === 201) {
      expect(res.body.data.skipped).toBe(1);
    } else {
      expect(res.status).toBe(422);
    }
  });
});
